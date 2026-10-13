// Walk-forward backtest for the app. Signals use only closed bars ≤ i (no lookahead); see sim.ts.
import type { Candle } from "./indicators";
import type { Dir } from "./scan";
import type { Settings } from "./settings";
import { signalsAt, simulate, stats } from "./sim";
export type BtInput = { candles: Candle[]; startIdx: number; settings: Settings; zone: 0 | 1 | 2; margin: number; feePct: number; spreadPct: number; window?: number };
export type BtTrade = { dir: Dir; entryT: number; exitT: number; entry: number; exit: number; stop: number; tp1: number; outcome: "tp1" | "stop" | "be" | "partial" | "open"; pnl: number; pnlPct: number; r: number };
export type BtResult = { trades: BtTrade[]; equity: { t: number; v: number }[]; hold: { t: number; v: number }[]; wins: number; losses: number; winRate: number; totalReturn: number; holdReturn: number; maxDD: number; final: number; bars: number; expR: number };
export function backtest(inp: BtInput, onProgress?: (p: number) => void): BtResult {
  const { candles: c, startIdx, settings: s, zone, margin, feePct, spreadPct } = inp;
  const costFrac = (2 * feePct + spreadPct + 2 * (s.slippagePct ?? 0)) / 100;
  const sig = signalsAt(c, startIdx, s, inp.window ?? 300, onProgress);
  const sim = simulate(c, sig, { zone, k: s.stopAtr, tpR: s.minRR, exit: s.exitMode, onClose: s.entryOnClose, costFrac, from: startIdx });
  let eq = margin; const trades: BtTrade[] = sim.map((t) => { const pnl = eq * (t.pct / 100); eq += pnl; return { ...t, pnl, pnlPct: t.pct }; });
  const equity: BtResult["equity"] = [], hold: BtResult["hold"] = []; const p0 = c[startIdx]?.o ?? 1; let v = margin, k = 0;
  for (let i = startIdx; i < c.length; i++) { while (k < trades.length && trades[k].exitT <= c[i].t) v += trades[k++].pnl; equity.push({ t: c[i].t, v }); hold.push({ t: c[i].t, v: margin * (c[i].c / p0) * (1 - feePct / 100) ** 2 }); }
  let peak = -Infinity, dd = 0; for (const e of equity) { peak = Math.max(peak, e.v); dd = Math.max(dd, (peak - e.v) / peak); }
  const wins = trades.filter((t) => t.pnl > 0).length;
  return { trades, equity, hold, wins, losses: trades.length - wins, winRate: trades.length ? (100 * wins) / trades.length : 0, totalReturn: (100 * (eq - margin)) / margin, holdReturn: hold.length ? (100 * (hold[hold.length - 1].v - margin)) / margin : 0, maxDD: dd * 100, final: eq, bars: c.length - startIdx, expR: stats(sim).exp };
}
export const HL_MAX_CANDLES = 5000;
