// Walk-forward backtest for the app. Signals use only closed bars ≤ i (no lookahead); see sim.ts.
import type { Candle } from "./indicators";
import type { Dir } from "./scan";
import type { Settings } from "./settings";
import { signalsAt, simulate, stats, type Amb, type BarSig, type Resolution } from "./sim";
import { half, monteCarlo, verdict, type Half, type MC, type Verdict } from "./robust";
export type BtInput = { candles: Candle[]; startIdx: number; settings: Settings; zone: 0 | 1 | 2; margin: number; feePct: number; spreadPct: number; window?: number };
export type BtTrade = { dir: Dir; entryT: number; exitT: number; entry: number; exit: number; stop: number; tp1: number; outcome: "tp1" | "stop" | "be" | "partial" | "open"; pnl: number; pnlPct: number; r: number };
export type BtResult = { trades: BtTrade[]; equity: { t: number; v: number }[]; hold: { t: number; v: number }[]; wins: number; losses: number; winRate: number; totalReturn: number; holdReturn: number; maxDD: number; final: number; bars: number; expR: number; amb: Amb[]; resolvedCount: number; split?: { at: number; a: Half; b: Half; verdict: Verdict }; mc: MC | null };
export function backtest(inp: BtInput, onProgress?: (p: number) => void, resolved?: Record<string, Resolution>, split = false): BtResult {
  return runWith(inp, signalsAt(inp.candles, inp.startIdx, inp.settings, inp.window ?? 300, onProgress), resolved, split);
}
/** Run the simulator on precomputed signals (the worker keeps them, so magnifier re-runs are instant). */
export function runWith(inp: BtInput, sig: BarSig[], resolved: Record<string, Resolution> = {}, split = false): BtResult {
  const { candles: c, startIdx, settings: s, zone, margin, feePct, spreadPct } = inp;
  const costFrac = (2 * feePct + spreadPct + 2 * (s.slippagePct ?? 0)) / 100; const amb: Amb[] = [];
  const base = { zone, k: s.stopAtr, tpR: s.minRR, exit: s.exitMode, onClose: s.entryOnClose, costFrac, resolved, amb };
  const sim = simulate(c, sig, { ...base, from: startIdx });
  let sp: BtResult["split"];
  if (split) { const at = startIdx + Math.floor((c.length - startIdx) * 0.6);
    const A = half(simulate(c, sig, { ...base, from: startIdx, to: at })), B = half(simulate(c, sig, { ...base, from: at }));
    sp = { at: c[at].t, a: A, b: B, verdict: verdict(A, B) }; }
  const uniq = [...new Map(amb.map((a) => [a.key, a])).values()];
  let eq = margin; const trades: BtTrade[] = sim.map((t) => { const pnl = eq * (t.pct / 100); eq += pnl; return { ...t, pnl, pnlPct: t.pct }; });
  const equity: BtResult["equity"] = [], hold: BtResult["hold"] = []; const p0 = c[startIdx]?.o ?? 1; let v = margin, k = 0;
  for (let i = startIdx; i < c.length; i++) { while (k < trades.length && trades[k].exitT <= c[i].t) v += trades[k++].pnl; equity.push({ t: c[i].t, v }); hold.push({ t: c[i].t, v: margin * (c[i].c / p0) * (1 - feePct / 100) ** 2 }); }
  let peak = -Infinity, dd = 0; for (const e of equity) { peak = Math.max(peak, e.v); dd = Math.max(dd, (peak - e.v) / peak); }
  const wins = trades.filter((t) => t.pnl > 0).length;
  return { trades, equity, hold, wins, losses: trades.length - wins, winRate: trades.length ? (100 * wins) / trades.length : 0, totalReturn: (100 * (eq - margin)) / margin, holdReturn: hold.length ? (100 * (hold[hold.length - 1].v - margin)) / margin : 0, maxDD: dd * 100, final: eq, bars: c.length - startIdx, expR: stats(sim).exp, amb: uniq, resolvedCount: uniq.filter((a) => resolved[a.key]).length, split: sp, mc: monteCarlo(sim) };
}
export const HL_MAX_CANDLES = 5000;
