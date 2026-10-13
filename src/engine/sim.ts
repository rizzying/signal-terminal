// Shared backtest core: (1) per-bar signals computed walk-forward, (2) a cheap trade simulator.
import type { Candle } from "./indicators";
import { scan, type Dir } from "./scan";
import type { Settings } from "./settings";
export type BarSig = { atr: number; long?: { conf: number; z: [number, number][] }; short?: { conf: number; z: [number, number][] } } | null;
/** Signals decided at the CLOSE of bar i using only bars ≤ i. Zones are raw [bottom, top] (stop buffer applied later). */
export function signalsAt(c: Candle[], startIdx: number, s: Settings, window = 300, onP?: (p: number) => void): BarSig[] {
  const out: BarSig[] = new Array(c.length).fill(null); const s0 = { ...s, stopAtr: 0, heatmapWeight: 0 };
  for (let i = Math.max(startIdx, 30); i < c.length; i++) {
    const win = c.slice(Math.max(0, i + 1 - window), i + 1); const b: NonNullable<BarSig> = { atr: 0 };
    for (const d of ["long", "short"] as Dir[]) { const su = scan(win, d, s0); b.atr = su.atr; if (su.shown) b[d] = { conf: su.confidence, z: su.zones.map((z) => [z.bottom, z.top] as [number, number]) }; }
    out[i] = b.long || b.short ? b : { atr: b.atr };
    if (onP && i % 200 === 0) onP((i - startIdx) / (c.length - startIdx));
  }
  return out;
}
/** A candle where the order of events is unknown from OHLC alone. kind "exit": stop and target both inside; "entry": filled and then stop/target in the same candle. */
export type Amb = { key: string; i: number; t: number; kind: "exit" | "entry"; dir: Dir; fill?: number; stop: number; tgt: number };
export type Resolution = "stop" | "tp" | "none";
export type SimOpts = { zone: 0 | 1 | 2; k: number; tpR: number; exit: 0 | 1 | 2; onClose: boolean; costFrac: number; ttl?: number; from?: number; to?: number;
  /** answers from lower-timeframe candles; missing = conservative (stop first) */ resolved?: Record<string, Resolution>; /** collects ambiguous candles met */ amb?: Amb[] };
const akey = (kind: string, t: number, stop: number, tgt: number) => `${kind}:${t}:${stop.toPrecision(10)}:${tgt.toPrecision(10)}`;
export type SimTrade = { dir: Dir; entryT: number; exitT: number; entry: number; exit: number; stop: number; tp1: number; r: number; pct: number; outcome: "tp1" | "stop" | "be" | "partial" | "open" };
/** exit: 0 = all at tpR; 1 = half at 2R, rest at 3R; 2 = half at 2R, rest stop moved to break-even (rest target 3R). */
export function simulate(c: Candle[], sig: BarSig[], o: SimOpts): SimTrade[] {
  const from = o.from ?? 0, to = o.to ?? c.length, ttl = o.ttl ?? 12; const out: SimTrade[] = [];
  type P = { dir: Dir; lo: number; hi: number; stop: number; age: number };
  let pend: P | null = null; let pos: { dir: Dir; entry: number; stop: number; R: number; t: number; half: boolean; i: number } | null = null;
  const push = (p: NonNullable<typeof pos>, exitPx: number, i: number, outcome: SimTrade["outcome"], partialR = 0) => {
    const L = p.dir === "long"; const mv = (x: number) => (L ? x - p.entry : p.entry - x);
    const grossR = p.half ? 0.5 * partialR + 0.5 * (mv(exitPx) / p.R) : mv(exitPx) / p.R; const costR = (o.costFrac * p.entry) / p.R; const r = grossR - costR;
    out.push({ dir: p.dir, entryT: c[p.t].t, exitT: c[i].t, entry: p.entry, exit: exitPx, stop: p.stop, tp1: L ? p.entry + o.tpR * p.R : p.entry - o.tpR * p.R, r, pct: (r * p.R / p.entry) * 100, outcome });
  };
  for (let i = from; i < to; i++) {
    const b = c[i];
    if (pos && i > pos.i) {
      const L = pos.dir === "long"; const lvl = (m: number) => (L ? pos!.entry + m * pos!.R : pos!.entry - m * pos!.R);
      const stopPx = pos.half && o.exit === 2 ? pos.entry : pos.stop; let hitS = L ? b.l <= stopPx : b.h >= stopPx;
      const tgt = o.exit === 0 ? o.tpR : pos.half ? 3 : 2; let hitT = L ? b.h >= lvl(tgt) : b.l <= lvl(tgt);
      if (hitS && hitT) { const key = akey("exit", b.t, stopPx, lvl(tgt)); o.amb?.push({ key, i, t: b.t, kind: "exit", dir: pos.dir, stop: stopPx, tgt: lvl(tgt) }); if (o.resolved?.[key] === "tp") hitS = false; else hitT = false; }
      if (hitS) { push(pos, L ? Math.min(b.o, stopPx) : Math.max(b.o, stopPx), i, pos.half ? (o.exit === 2 ? "be" : "partial") : "stop", 2); pos = null; }
      else if (hitT) { if (o.exit === 0 || pos.half) { push(pos, lvl(tgt), i, pos.half ? "partial" : "tp1", 2); pos = null; } else { pos.half = true;
        const hit3 = L ? b.h >= lvl(3) : b.l <= lvl(3); if (hit3) { push(pos, lvl(3), i, "partial", 2); pos = null; } } }
    }
    if (!pos && pend && i > pend.age - ttl) {
      const p: P = pend; const L = p.dir === "long"; let fill: number | null = null;
      if (o.onClose) { if (b.c >= p.lo && b.c <= p.hi) fill = b.c; }
      else { const mid = (p.lo + p.hi) / 2; if (L ? b.l <= mid : b.h >= mid) fill = L ? Math.min(b.o, mid) : Math.max(b.o, mid); }
      if (L ? b.c <= p.stop : b.c >= p.stop) pend = null; // invalidated before entry
      else if (fill != null) { const R = Math.abs(fill - p.stop); if (R > 0) { pos = { dir: p.dir, entry: fill, stop: p.stop, R, t: i, half: false, i: o.onClose ? i : i - 1 }; pend = null;
        if (!o.onClose) { // touch mode: stop or target can follow the fill inside the same candle
          const tg = L ? fill + o.tpR * R : fill - o.tpR * R; const hs = L ? b.l <= p.stop : b.h >= p.stop; const ht = o.exit === 0 && (L ? b.h >= tg : b.l <= tg);
          if (hs || ht) { const key = akey("entry", b.t, p.stop, tg); o.amb?.push({ key, i, t: b.t, kind: "entry", dir: p.dir, fill, stop: p.stop, tgt: tg });
            const res = o.resolved?.[key] ?? (hs ? "stop" : "none");
            if (res === "stop") { push(pos, p.stop, i, "stop"); pos = null; } else if (res === "tp" && ht) { push(pos, tg, i, "tp1"); pos = null; } } } } }
      else if (i - p.age >= ttl) pend = null;
    }
    if (!pos) { const s = sig[i]; let best: P | null = null; let bc = -1;
      if (s) for (const d of ["long", "short"] as Dir[]) { const x = s[d]; if (!x) continue; const z = x.z[o.zone]; if (!z) continue; const [lo, hi] = z;
        const stop = d === "long" ? lo - o.k * s.atr : hi + o.k * s.atr; if (d === "long" ? b.c <= stop : b.c >= stop) continue;
        if (x.conf > bc) { bc = x.conf; best = { dir: d, lo, hi, stop, age: i }; } }
      if (best) pend = best; }
  }
  if (pos) push(pos, c[to - 1].c, to - 1, "open", 2);
  return out;
}
export function stats(t: SimTrade[]) {
  const n = t.length; const sum = t.reduce((a, x) => a + x.r, 0); let eq = 0, pk = 0, dd = 0; for (const x of t) { eq += x.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const w = t.filter((x) => x.r > 0).length; return { n, exp: n ? sum / n : 0, totalR: sum, win: n ? (100 * w) / n : 0, ddR: dd, pf: (() => { const g = t.filter((x) => x.r > 0).reduce((a, x) => a + x.r, 0), l = -t.filter((x) => x.r < 0).reduce((a, x) => a + x.r, 0); return l ? g / l : g ? 99 : 0; })() };
}
