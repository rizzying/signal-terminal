// Walk-forward backtest. At each closed bar we only look at data up to that bar (no lookahead).
import type { Candle } from "./indicators";
import { scan, type Dir } from "./scan";
import type { Settings } from "./settings";
export type BtInput = { candles: Candle[]; startIdx: number; settings: Settings; zone: 0 | 1 | 2; margin: number; feePct: number; spreadPct: number; maxLev?: number; window?: number };
export type BtTrade = { dir: Dir; entryT: number; exitT: number; entry: number; exit: number; stop: number; tp1: number; outcome: "tp1" | "stop" | "open"; pnl: number; pnlPct: number; confidence: number };
export type BtResult = { trades: BtTrade[]; equity: { t: number; v: number }[]; hold: { t: number; v: number }[]; wins: number; losses: number; winRate: number; totalReturn: number; holdReturn: number; maxDD: number; final: number; bars: number };
type Pending = { dir: Dir; entry: number; stop: number; tp1: number; confidence: number; ttl: number };
export function backtest(inp: BtInput, onProgress?: (p: number) => void): BtResult {
  const { candles: c, startIdx, settings: s, zone, margin, feePct, spreadPct } = inp; const W = inp.window ?? 300;
  const cost = (2 * feePct + spreadPct + 2 * (s.slippagePct ?? 0)) / 100; // round-trip, as a fraction of notional
  let eq = margin, pend: Pending | null = null, pos: (Pending & { entryT: number }) | null = null;
  const trades: BtTrade[] = [], equity: BtResult["equity"] = [], hold: BtResult["hold"] = [];
  const p0 = c[startIdx]?.o ?? 0; const close = (t: Pending & { entryT: number }, i: number, exit: number, outcome: BtTrade["outcome"]) => {
    const g = t.dir === "long" ? exit / t.entry - 1 : 1 - exit / t.entry; const r = g - cost; const pnl = eq * r; eq += pnl;
    trades.push({ dir: t.dir, entryT: t.entryT, exitT: c[i].t, entry: t.entry, exit, stop: t.stop, tp1: t.tp1, outcome, pnl, pnlPct: r * 100, confidence: t.confidence }); };
  for (let i = startIdx; i < c.length; i++) {
    const b = c[i];
    if (!pos && pend) { // touch of the chosen zone's entry on this bar
      const hit = pend.dir === "long" ? b.l <= pend.entry : b.h >= pend.entry;
      if (hit) { const fill = pend.dir === "long" ? Math.min(b.o, pend.entry) : Math.max(b.o, pend.entry); pos = { ...pend, entry: fill, entryT: b.t }; pend = null; }
      else if (--pend.ttl <= 0) pend = null;
    }
    if (pos) { // stop is checked first when both are inside one bar (conservative)
      const L = pos.dir === "long"; const st = L ? b.l <= pos.stop : b.h >= pos.stop; const tp = L ? b.h >= pos.tp1 : b.l <= pos.tp1;
      if (st) { close(pos, i, L ? Math.min(b.o, pos.stop) : Math.max(b.o, pos.stop), "stop"); pos = null; }
      else if (tp) { close(pos, i, pos.tp1, "tp1"); pos = null; }
    }
    if (!pos && !pend && i - startIdx >= 0) { // decide on closed bars up to i
      const win = c.slice(Math.max(0, i + 1 - W), i + 1);
      let best: Pending | null = null;
      for (const d of ["long", "short"] as Dir[]) {
        const su = scan(win, d, s, { maxLev: inp.maxLev ?? 20 }); const z = su.zones[zone];
        if (!su.shown || !z || z.pastStop || z.pastTp1) continue;
        if (!best || su.confidence > best.confidence) best = { dir: d, entry: z.entry, stop: z.stop, tp1: z.t1, confidence: su.confidence, ttl: 12 };
      }
      pend = best;
    }
    const mark = pos ? eq * (1 + (pos.dir === "long" ? b.c / pos.entry - 1 : 1 - b.c / pos.entry)) : eq;
    equity.push({ t: b.t, v: mark }); hold.push({ t: b.t, v: margin * (b.c / p0) * (1 - feePct / 100) * (1 - feePct / 100) });
    if (onProgress && (i - startIdx) % 100 === 0) onProgress((i - startIdx) / (c.length - startIdx));
  }
  if (pos) { const L = c.length - 1; close(pos, L, c[L].c, "open"); equity[equity.length - 1].v = eq; }
  let peak = -Infinity, dd = 0; for (const e of equity) { peak = Math.max(peak, e.v); dd = Math.max(dd, (peak - e.v) / peak); }
  const wins = trades.filter((t) => t.pnl > 0).length, losses = trades.length - wins;
  return { trades, equity, hold, wins, losses, winRate: trades.length ? (100 * wins) / trades.length : 0, totalReturn: (100 * (eq - margin)) / margin, holdReturn: hold.length ? (100 * (hold[hold.length - 1].v - margin)) / margin : 0, maxDD: dd * 100, final: eq, bars: c.length - startIdx };
}
export const HL_MAX_CANDLES = 5000;
