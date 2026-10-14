import { atr, ema, rsi, type Candle } from "./indicators";
import { estimateLiqMap } from "./liqmap";
import { DEFAULTS, type Settings, type SignalKey, SIGNAL_NAMES } from "./settings";

export type Dir = "long" | "short";
export type Pivot = { i: number; price: number; kind: "high" | "low"; label?: "HH" | "HL" | "LH" | "LL" };
export type Break = { i: number; dir: "bull" | "bear"; level: number; choch: boolean };
export type Box = { top: number; bottom: number; i: number; kind: "OB" | "FVG" | "Breaker" | "Swing" | "Liq zone"; dir: "bull" | "bear"; retests?: number; liq?: number };
export type Signal = { key: SignalKey; name: string; pass: boolean; weight: number; detail: string };
export type Costs = { spread: number; fees: number; slip: number; total: number };
export type Zone = { pastTp1: boolean; pastStop: boolean; costs: Costs; rawStop: number; rank: 1 | 2 | 3; name: "Aggressive" | "Balanced" | "Deep"; top: number; bottom: number; entry: number; stop: number; t1: number; t2: number; rr1: number; rr2: number; source: string; ready: boolean; note?: string };
export type Setup = { dir: Dir; confidence: number; band: "Low" | "Medium" | "High"; othersAgree: number; othersTotal: number; structureOk: boolean; reason: string; shown: boolean; signals: Signal[]; zones: Zone[]; htf?: { tf: string; agrees: boolean | null; detail: string }; price: number; atr: number };
export type Analysis = { pivots: Pivot[]; breaks: Break[]; obs: Box[]; fvgs: Box[]; breakers: Box[]; rsi: number[]; emaF: number[]; emaS: number[]; atr: number; liq: { price: number; long: number; short: number }[] };

export function pivots(c: Candle[], n = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = n; i < c.length - n; i++) {
    let hi = true, lo = true;
    for (let j = i - n; j <= i + n; j++) { if (j === i) continue; if (c[j].h >= c[i].h) hi = false; if (c[j].l <= c[i].l) lo = false; }
    if (hi) out.push({ i, price: c[i].h, kind: "high" }); if (lo) out.push({ i, price: c[i].l, kind: "low" });
  }
  let ph: number | null = null, pl: number | null = null;
  for (const p of out) {
    if (p.kind === "high") { if (ph != null) p.label = p.price > ph ? "HH" : "LH"; ph = p.price; }
    else { if (pl != null) p.label = p.price > pl ? "HL" : "LL"; pl = p.price; }
  }
  return out;
}
export function structureBreaks(c: Candle[], piv: Pivot[], n = 3): Break[] {
  const out: Break[] = []; let trend: "bull" | "bear" | null = null; let k = 0; const known: Pivot[] = [];
  const used = new Set<Pivot>();
  for (let i = 0; i < c.length; i++) {
    while (k < piv.length && piv[k].i + n < i) known.push(piv[k++]);
    let hi: Pivot | undefined, lo: Pivot | undefined;
    for (let j = known.length - 1; j >= 0 && (!hi || !lo); j--) { if (!hi && known[j].kind === "high") hi = known[j]; if (!lo && known[j].kind === "low") lo = known[j]; }
    if (hi && !used.has(hi) && c[i].c > hi.price) { used.add(hi); out.push({ i, dir: "bull", level: hi.price, choch: trend === "bear" }); trend = "bull"; }
    else if (lo && !used.has(lo) && c[i].c < lo.price) { used.add(lo); out.push({ i, dir: "bear", level: lo.price, choch: trend === "bull" }); trend = "bear"; }
  }
  return out;
}
/** Order blocks: last opposite candle before each break's impulse. */
export function orderBlocks(c: Candle[], br: Break[], lookback = 10): Box[] {
  const out: Box[] = [];
  for (const b of br) for (let j = b.i; j >= Math.max(0, b.i - lookback); j--) {
    if (b.dir === "bull" && c[j].c < c[j].o) { out.push({ top: c[j].h, bottom: c[j].l, i: j, kind: "OB", dir: "bull" }); break; }
    if (b.dir === "bear" && c[j].c > c[j].o) { out.push({ top: c[j].h, bottom: c[j].l, i: j, kind: "OB", dir: "bear" }); break; }
  }
  return out;
}
export function fvgs(c: Candle[], minSize = 0): Box[] {
  const out: Box[] = [];
  for (let i = 2; i < c.length; i++) {
    if (c[i].l > c[i - 2].h && c[i].l - c[i - 2].h >= minSize) out.push({ bottom: c[i - 2].h, top: c[i].l, i: i - 1, kind: "FVG", dir: "bull" });
    if (c[i].h < c[i - 2].l && c[i - 2].l - c[i].h >= minSize) out.push({ top: c[i - 2].l, bottom: c[i].h, i: i - 1, kind: "FVG", dir: "bear" });
  }
  return out.filter((z) => !c.slice(z.i + 2).some((k) => (z.dir === "bull" ? k.l <= z.bottom : k.h >= z.top)));
}
/** Breakers: an OB that price closed through flips polarity. Clean = retested ≤ maxRetests times since. */
export function breakers(c: Candle[], obs: Box[], maxRetests = 1): Box[] {
  const out: Box[] = [];
  for (const ob of obs) {
    let bi = -1;
    for (let i = ob.i + 1; i < c.length; i++) if (ob.dir === "bull" ? c[i].c < ob.bottom : c[i].c > ob.top) { bi = i; break; }
    if (bi < 0) continue;
    const dir = ob.dir === "bull" ? "bear" : "bull"; let retests = 0, inside = false, dead = false;
    for (let i = bi + 1; i < c.length; i++) {
      const touch = c[i].h >= ob.bottom && c[i].l <= ob.top;
      if (touch && !inside) retests++; inside = touch;
      if (dir === "bull" ? c[i].c < ob.bottom : c[i].c > ob.top) { dead = true; break; }
    }
    if (!dead && retests <= maxRetests) out.push({ ...ob, kind: "Breaker", dir, retests });
  }
  return out;
}
export function analyze(c: Candle[], s: Settings = DEFAULTS, maxLev = 20, mmr?: number): Analysis {
  const a = atr(c, s.atrLen); const A = a[a.length - 1] || (c.at(-1)!.h - c.at(-1)!.l) || 1;
  const piv = pivots(c, s.swingLen); const br = structureBreaks(c, piv, s.swingLen);
  const minI = c.length - s.obMaxAgeBars;
  const allObs = orderBlocks(c, br).filter((o) => o.i >= minI);
  const last = c.length - 1;
  const obs = allObs.filter((o) => !c.slice(o.i + 1).some((k) => (o.dir === "bull" ? k.c < o.bottom : k.c > o.top)));
  const closes = c.map((k) => k.c);
  return {
    pivots: piv, breaks: br, obs: s.obMustBreak ? obs : allObs, fvgs: fvgs(c, s.fvgMinAtr * A).filter((f) => f.i >= minI),
    breakers: breakers(c, allObs, s.breakerMaxRetests), rsi: rsi(closes, s.rsiLen), emaF: ema(closes, s.emaFast), emaS: ema(closes, s.emaSlow), atr: A,
    liq: s.heatmapWeight > 0 && last > 20 ? estimateLiqMap(c, { maxLev, mmr }).bins : [],
  };
}
function rsiDivergence(c: Candle[], piv: Pivot[], r: number[], dir: Dir, look: number): boolean {
  const kind = dir === "long" ? "low" : "high";
  const ps = piv.filter((p) => p.kind === kind && p.i >= c.length - look).slice(-2);
  if (ps.length < 2) return false;
  const [a, b] = ps;
  return dir === "long" ? b.price < a.price && r[b.i] > r[a.i] : b.price > a.price && r[b.i] < r[a.i];
}
export function signalsFor(c: Candle[], an: Analysis, dir: Dir, s: Settings): Signal[] {
  const px = c.at(-1)!.c; const bull = dir === "long"; const d = bull ? "bull" : "bear";
  const sig = (key: SignalKey, pass: boolean, detail: string): Signal => ({ key, name: SIGNAL_NAMES[key], pass, weight: s.weights[key] ?? 1, detail });
  const lb = an.breaks.at(-1);
  const structure = sig("structure", !!lb && lb.dir === d, lb ? `Last break: ${lb.choch ? "ChoCH" : "BoS"} ${lb.dir === "bull" ? "up" : "down"} at ${fmt(lb.level)}` : "No break yet");
  const zs = [...an.obs, ...an.fvgs].filter((z) => z.dir === d && (bull ? z.top <= px * 1.0001 : z.bottom >= px * 0.9999));
  const fvgob = sig("fvgob", zs.length > 0, zs.length ? `${zs.length} unmitigated ${bull ? "bullish" : "bearish"} OB/FVG ${bull ? "below" : "above"} price` : `No unmitigated ${bull ? "bullish" : "bearish"} OB/FVG`);
  const lh = [...an.pivots].reverse().find((p) => p.kind === "high" && p.label), ll = [...an.pivots].reverse().find((p) => p.kind === "low" && p.label);
  const swings = sig("swings", bull ? lh?.label === "HH" && ll?.label === "HL" : lh?.label === "LH" && ll?.label === "LL", `Latest swings: ${lh?.label ?? "–"} / ${ll?.label ?? "–"}`);
  const brk = an.breakers.filter((b) => b.dir === d);
  const breaker = sig("breaker", brk.length > 0, brk.length ? `${brk.length} clean ${d} breaker${brk.length > 1 ? "s" : ""} (≤${s.breakerMaxRetests} retest)` : "No clean breaker");
  // inducement: a minor swing on the opposite side swept by a wick (and closed back) within lookback
  const from = c.length - s.inducementLookback; let ind: string | null = null;
  for (const p of an.pivots.filter((p) => p.kind === (bull ? "low" : "high") && p.i >= from - 20)) {
    for (let i = Math.max(p.i + 1, from); i < c.length; i++) {
      if (bull ? c[i].l < p.price && c[i].c > p.price : c[i].h > p.price && c[i].c < p.price) { ind = `Swept ${bull ? "low" : "high"} ${fmt(p.price)} and closed back`; break; }
    }
  }
  const inducement = sig("inducement", !!ind, ind ?? `No sweep in last ${s.inducementLookback} bars`);
  const r = an.rsi.at(-1)!; const div = rsiDivergence(c, an.pivots, an.rsi, dir, s.divLookback);
  const rOk = bull ? r < s.rsiOB && (r > 50 || r <= s.rsiOS || div) : r > s.rsiOS && (r < 50 || r >= s.rsiOB || div);
  const rsiS = sig("rsi", rOk, `RSI ${r.toFixed(1)}${div ? `, ${bull ? "bullish" : "bearish"} divergence` : ""}`);
  const ef = an.emaF.at(-1)!, es = an.emaS.at(-1)!;
  const emaS = Number.isFinite(es) ? sig("ema", bull ? ef > es : ef < es, `EMA${s.emaFast} ${ef > es ? ">" : "<"} EMA${s.emaSlow}`) : { ...sig("ema", false, `Not enough history for EMA${s.emaSlow} (skipped)`), weight: 0 };
  return [structure, fvgob, swings, breaker, inducement, rsiS, emaS, breakoutSignal(c, an, dir, s), liqMagnetSignal(c, an, dir, s)];
}
/** Breakout with volume: a close through the last confirmed swing high (low for shorts) within the last N bars, on ≥ X× average volume. */
export function breakoutSignal(c: Candle[], an: Pick<Analysis, "pivots">, dir: Dir, s: Settings): Signal {
  const name = SIGNAL_NAMES.breakout; const w = s.weights.breakout ?? 1; const bull = dir === "long";
  if (!s.useBreakout) return { key: "breakout", name, pass: false, weight: 0, detail: "Off in Settings" };
  const vols = c.slice(-(s.boAvgLen + s.boLookback)).map((k) => k.v);
  if (!vols.some((v) => v > 0) || vols.some((v) => !Number.isFinite(v))) return { key: "breakout", name, pass: false, weight: 0, detail: "Skipped: this exchange gives no volume for this market" };
  let best: string | null = null; let near: string | null = null;
  for (let i = c.length - 1; i >= Math.max(1, c.length - s.boLookback); i--) {
    const lvlP = [...an.pivots].reverse().find((p) => p.kind === (bull ? "high" : "low") && p.i + s.swingLen < i); if (!lvlP) continue;
    const lvl = lvlP.price; const crossed = bull ? c[i].c > lvl && c[i - 1].c <= lvl : c[i].c < lvl && c[i - 1].c >= lvl; if (!crossed) continue;
    const win = c.slice(Math.max(0, i - s.boAvgLen), i).map((k) => k.v); const avg = win.reduce((a, b) => a + b, 0) / (win.length || 1);
    const x = avg > 0 ? c[i].v / avg : 0; const txt = `Closed ${bull ? "above" : "below"} ${fmt(lvl)} on ${x.toFixed(1)}× avg volume`;
    if (x >= s.boMult) { best = txt; break; } near ??= `${txt} (needs ${s.boMult}×)`;
  }
  return { key: "breakout", name, pass: !!best, weight: w, detail: best ?? near ?? `No close ${bull ? "above the last swing high" : "below the last swing low"} in the last ${s.boLookback} bars` };
}
/** Heavy estimated liquidation clusters on the trade side: short liqs above price (short entries), long liqs below (long entries).
 *  "Heavy" = at least half the biggest bin on that side; touching bins are merged into one cluster. */
export function heavyClusters(an: Pick<Analysis, "liq" | "atr">, dir: Dir, px: number): { lo: number; hi: number; p: number; v: number }[] {
  const L = dir === "long"; const side = an.liq.map((b) => ({ p: b.price, v: L ? b.long : b.short })).filter((b) => b.v > 0 && (L ? b.p < px : b.p > px)).sort((a, b) => a.p - b.p);
  if (!side.length) return []; const max = Math.max(...side.map((b) => b.v)); const step = side.length > 1 ? Math.min(...side.slice(1).map((b, i) => b.p - side[i].p)) : an.atr * 0.2;
  const out: { lo: number; hi: number; p: number; v: number }[] = [];
  for (const b of side.filter((b) => b.v >= 0.5 * max)) { const last = out.at(-1);
    if (last && b.p - last.hi <= step * 1.5) { last.hi = b.p; if (b.v > last.v) { last.v = b.v; last.p = b.p; } } else out.push({ lo: b.p, hi: b.p, p: b.p, v: b.v }); }
  return out;
}
/** Liq magnet: a heavy cluster sits inside one of the entry zones or within 0.5 ATR of it (price tends to get pulled there). */
export function liqMagnetSignal(c: Candle[], an: Analysis, dir: Dir, s: Settings): Signal {
  const name = SIGNAL_NAMES.liqmagnet; const w = s.weights.liqmagnet ?? 1;
  if (!s.useLiqMagnet) return { key: "liqmagnet", name, pass: false, weight: 0, detail: "Off in Settings" };
  if (!an.liq.length) return { key: "liqmagnet", name, pass: false, weight: 0, detail: "Skipped: heatmap off or no volume on this market" };
  const px = c.at(-1)!.c; const cl = heavyClusters(an, dir, px); const zs = buildZones(c, an, dir, s);
  const struct = zs.filter((z) => !z.source.startsWith("Liq zone") && !z.source.startsWith("ATR step")); // pure liq zones don't count
  const hits = struct.flatMap((z) => { const k = cl.find((k) => k.hi >= z.bottom - 0.5 * an.atr && k.lo <= z.top + 0.5 * an.atr); return k ? [{ z, k }] : []; });
  const detail = hits.length ? hits.map(({ z, k }) => `Liq cluster ~${fmt(k.p)} lines up with ${z.source.replace(/ \+ Liq zone$/, "")} (Zone ${z.rank})`).join("; ")
    : cl.length ? `Heavy cluster${cl.length > 1 ? "s" : ""} at ${cl.map((k) => fmt(k.p)).slice(0, 2).join(", ")} ${cl.length > 1 ? "don't" : "doesn't"} line up with an OB/FVG/breaker/swing zone` : `No heavy ${dir === "long" ? "long" : "short"} liq cluster ${dir === "long" ? "below" : "above"} price`;
  return { key: "liqmagnet", name, pass: hits.length > 0, weight: w, detail };
}
export const confidence = (sigs: Signal[]) => { const t = sigs.reduce((a, x) => a + x.weight, 0); return t ? Math.round((100 * sigs.reduce((a, x) => a + (x.pass ? x.weight : 0), 0)) / t) : 0; };

function liqNudge(stop: number, dir: Dir, an: Analysis, w: number): { stop: number; note?: string } {
  if (!w || !an.liq.length) return { stop };
  const side = an.liq.map((b) => ({ p: b.price, v: dir === "long" ? b.long : b.short }));
  const max = Math.max(...side.map((x) => x.v)); if (!(max > 0)) return { stop };
  // a heavy cluster within 1 ATR beyond-or-at the stop draws a sweep: move the stop past it
  const near = side.filter((x) => x.v > 0.5 * max && Math.abs(x.p - stop) < an.atr && (dir === "long" ? x.p <= stop + an.atr * 0.3 : x.p >= stop - an.atr * 0.3));
  if (!near.length) return { stop };
  const ext = dir === "long" ? Math.min(...near.map((x) => x.p)) - 0.1 * an.atr : Math.max(...near.map((x) => x.p)) + 0.1 * an.atr;
  const ns = stop + (ext - stop) * w;
  return (dir === "long" ? ns < stop : ns > stop) ? { stop: ns, note: "Stop moved past an estimated liquidation cluster" } : { stop };
}
export type CostInput = { spread: number; feePct: number };
/** Round-trip trading cost in price units: spread once + taker fee and slippage on entry and exit. */
export function costsAt(entry: number, ci: CostInput | undefined, s: Settings): Costs {
  const spread = ci && s.useSpread ? Math.max(0, ci.spread) : 0; const fees = entry * 2 * ((ci?.feePct ?? 0) / 100); const slip = entry * 2 * (s.slippagePct / 100);
  return { spread, fees, slip, total: spread + fees + slip };
}
/** Zones farther than this many ATRs from price are dropped. */
export const MAX_ZONE_ATR = 3.5;
/** A stand-alone liq-cluster zone must be within this many ATRs of a swing/OB/FVG/breaker. */
export const LIQ_NEAR_ATR = 1;
export function buildZones(c: Candle[], an: Analysis, dir: Dir, s: Settings, ci?: CostInput): Zone[] {
  const px = c.at(-1)!.c; const bull = dir === "long"; const d = bull ? "bull" : "bear"; const A = an.atr;
  let cands: Box[] = [...an.obs, ...an.fvgs, ...an.breakers].filter((z) => z.dir === d && (bull ? z.bottom < px : z.top > px));
  let swings = an.pivots.filter((p) => p.kind === (bull ? "low" : "high") && (bull ? p.price < px : p.price > px))
    .map<Box>((p) => ({ top: bull ? p.price + 0.15 * A : p.price, bottom: bull ? p.price : p.price - 0.15 * A, i: p.i, kind: "Swing", dir: d }));
  const dist = (z: Box) => (bull ? px - z.top : z.bottom - px);
  cands = cands.map((z) => (bull ? { ...z, top: Math.min(z.top, px) } : { ...z, bottom: Math.max(z.bottom, px) }));
  // Heavy est. liq clusters on the trade side: snap/extend a nearby structure zone to include them, otherwise they become their own "Liq zone"
  if (s.heatmapWeight > 0) for (const k of heavyClusters(an, dir, px)) {
    const box = { lo: k.lo - 0.1 * A, hi: k.hi + 0.1 * A }; const near = (z: Box) => box.lo <= z.top + 0.3 * A && z.bottom <= box.hi + 0.3 * A;
    const all = [...cands, ...swings]; const j = all.findIndex(near);
    if (j >= 0) { const z = all[j]; z.top = Math.max(z.top, bull ? Math.min(box.hi, px) : box.hi); z.bottom = Math.min(z.bottom, bull ? box.lo : Math.max(box.lo, px)); z.liq = k.p; }
    else if (all.some((z) => box.lo <= z.top + LIQ_NEAR_ATR * A && z.bottom <= box.hi + LIQ_NEAR_ATR * A)) // a stand-alone liq zone must sit next to real structure
      cands.push({ top: bull ? Math.min(box.hi, px) : box.hi, bottom: bull ? box.lo : Math.max(box.lo, px), i: c.length - 1, kind: "Liq zone", dir: d, liq: k.p });
  }
  // distance cap: zones whose middle is more than MAX_ZONE_ATR × ATR from price are dropped (old, far-away structure or clusters)
  const inReach = (z: Box) => Math.abs((z.top + z.bottom) / 2 - px) <= MAX_ZONE_ATR * A;
  cands = cands.filter(inReach); swings = swings.filter(inReach);
  const pick: Box[] = [];
  const overlaps = (a: Box, b: Box) => a.bottom <= b.top + 0.1 * A && b.bottom <= a.top + 0.1 * A;
  for (const z of [...cands].sort((a, b) => dist(a) - dist(b))) if (!pick.some((p) => overlaps(p, z))) pick.push(z);
  for (const z of swings.sort((a, b) => dist(a) - dist(b))) if (pick.length < 6 && !pick.some((p) => overlaps(p, z))) pick.push(z);
  pick.sort((a, b) => dist(a) - dist(b));
  let chosen: Box[];
  if (pick.length <= 3) chosen = pick;
  else chosen = [pick[0], pick[Math.floor((pick.length - 1) / 2)], pick[pick.length - 1]].filter((z, i, arr) => arr.indexOf(z) === i);
  // fallback: ATR-stepped levels inside the cap, beyond the deepest real zone first (real structure keeps the nearer ranks), skipping overlaps
  const deep = chosen.length ? Math.max(...chosen.map(dist)) : -Infinity; const steps = [1, 1.5, 2, 2.5, 3, MAX_ZONE_ATR].map((m) => m * A);
  for (const off of [...steps.filter((o) => o > deep), ...steps.filter((o) => o <= deep).reverse()]) { if (chosen.length >= 3) break; const lvl = bull ? px - off : px + off;
    const b: Box = { top: bull ? lvl + 0.2 * A : lvl, bottom: bull ? lvl : lvl - 0.2 * A, i: c.length - 1, kind: "Swing", dir: d, retests: -1 };
    if (!chosen.some((p) => overlaps(p, b))) chosen.push(b); }
  chosen.sort((a, b) => dist(a) - dist(b));
  const opp = an.pivots.filter((p) => p.kind === (bull ? "high" : "low")).map((p) => p.price);
  const names = ["Aggressive", "Balanced", "Deep"] as const;
  return chosen.slice(0, 3).map((z, k) => {
    const entry = (z.top + z.bottom) / 2;
    let stop = bull ? z.bottom - s.stopAtr * A : z.top + s.stopAtr * A;
    const nudge = liqNudge(stop, dir, an, s.heatmapWeight); stop = nudge.stop;
    const costs = costsAt(entry, ci, s); const rawStop = stop;
    stop = bull ? stop - costs.total : stop + costs.total; // widen the stop by round-trip costs
    const R = Math.abs(entry - stop) || A * 0.1;
    // net reward = price move minus costs; TP must clear minRR after costs
    const need = s.minRR * R + costs.total;
    // TP1 is a fixed R multiple (what the backtest study tested); TP2 = next structure beyond it
    const t1 = bull ? entry + need : entry - need;
    let t2 = opp.filter((p) => (bull ? p > t1 : p < t1)).sort((a, b) => (bull ? a - b : b - a)).find((t) => Math.abs(t - entry) > Math.abs(t1 - entry) * 1.3) ?? (bull ? entry + Math.abs(t1 - entry) * 1.6 : entry - Math.abs(t1 - entry) * 1.6);
    if (!((t2 - t1) * (bull ? 1 : -1) > 0)) t2 = bull ? t1 + 0.6 * Math.abs(t1 - entry) : t1 - 0.6 * Math.abs(t1 - entry); // TP2 always beyond TP1
    const src0 = z.retests === -1 ? "ATR step (no structure)" : z.kind === "Liq zone" ? `Liq zone (est. ${bull ? "long" : "short"} liquidations ~${fmt(z.liq!)})` : z.kind === "Swing" ? `Swing ${bull ? "low" : "high"}` : `${d === "bull" ? "Bullish" : "Bearish"} ${z.kind}`;
    const src = z.liq != null && z.kind !== "Liq zone" ? `${src0} + Liq zone` : src0;
    return { pastTp1: bull ? px >= t1 : px <= t1, pastStop: bull ? px <= stop : px >= stop, costs, rawStop, rank: (k + 1) as 1 | 2 | 3, name: names[k], top: z.top, bottom: z.bottom, entry, stop, t1, t2, rr1: (Math.abs(t1 - entry) - costs.total) / R, rr2: (Math.abs(t2 - entry) - costs.total) / R, source: src, ready: px <= z.top + 1e-9 && px >= z.bottom - 1e-9, note: nudge.note };
  });
}
export function htfAgree(htf: Candle[] | null, dir: Dir, s: Settings, tf: string): Setup["htf"] {
  if (!htf || htf.length < 30) return { tf, agrees: null, detail: "Not enough higher-timeframe data" };
  const p = pivots(htf, s.swingLen); const b = structureBreaks(htf, p, s.swingLen).at(-1);
  if (!b) return { tf, agrees: null, detail: `No ${tf} structure break yet` };
  const ok = b.dir === (dir === "long" ? "bull" : "bear");
  return { tf, agrees: ok, detail: `${tf} last ${b.choch ? "ChoCH" : "BoS"} is ${b.dir === "bull" ? "up" : "down"}` };
}
export function scan(c: Candle[], dir: Dir, s: Settings, opts: { maxLev?: number; mmr?: number; htf?: Candle[] | null; htfTf?: string; costs?: CostInput } = {}): Setup {
  if (c.length < MIN_CANDLES) throw new Error(`This market only has ${c.length} candles on this timeframe; Signal needs at least ${MIN_CANDLES}. Try a lower timeframe.`);
  const an = analyze(c, s, opts.maxLev, opts.mmr);
  const signals = signalsFor(c, an, dir, s); const conf = confidence(signals);
  const structureOk = signals.find((x) => x.key === "structure")!.pass; const others = signals.filter((x) => x.key !== "structure" && x.weight > 0);
  const othersAgree = others.filter((x) => x.pass).length; const minO = Math.min(s.minOthers, others.length);
  const fails: string[] = [];
  if (s.gateStructure && !structureOk) fails.push("structure (BoS/ChoCH) doesn't agree");
  if (othersAgree < minO) fails.push(`only ${othersAgree} of ${others.length} other signals agree (need ${minO})`);
  if (conf < s.threshold) fails.push(`confidence ${conf}% is under your ${s.threshold}% filter`);
  return { dir, confidence: conf, band: confidenceBand(conf), othersAgree, othersTotal: others.length, structureOk, reason: fails.join("; "), shown: !fails.length, signals, zones: buildZones(c, an, dir, s, opts.costs), htf: s.useHtf && opts.htfTf ? htfAgree(opts.htf ?? null, dir, s, opts.htfTf) : undefined, price: c.at(-1)!.c, atr: an.atr };
}
export const confidenceBand = (c: number): "Low" | "Medium" | "High" => (c > 70 ? "High" : c >= 50 ? "Medium" : "Low");
export const MIN_CANDLES = 30;
export const HTF: Record<string, string | undefined> = { "1m": "15m", "5m": "1h", "15m": "4h", "1h": "4h", "4h": "1d", "12h": "3d", "1d": "1w", "3d": "1w", "1w": undefined };
/** Snap a setup's prices to the exchange tick. Stops round away from entry so rounding never shrinks risk. */
export function roundSetup(st: Setup, round: (p: number, mode?: "near" | "down" | "up") => number): Setup {
  const L = st.dir === "long";
  return { ...st, zones: st.zones.map((z) => ({ ...z, top: round(z.top), bottom: round(z.bottom), entry: round(z.entry), stop: round(z.stop, L ? "down" : "up"), rawStop: round(z.rawStop, L ? "down" : "up"), t1: round(z.t1, L ? "up" : "down"), t2: round(z.t2, L ? "up" : "down") })) };
}
export function fmt(n: number) { if (!Number.isFinite(n)) return "–"; const a = Math.abs(n); const d = a >= 1000 ? 1 : a >= 10 ? 2 : a >= 1 ? 4 : 6; return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d }); }
