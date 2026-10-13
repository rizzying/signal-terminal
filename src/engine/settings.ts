export type Settings = {
  swingLen: number; rsiLen: number; rsiOB: number; rsiOS: number; divLookback: number;
  emaFast: number; emaSlow: number; atrLen: number;
  fvgMinAtr: number; obMustBreak: boolean; obMaxAgeBars: number; breakerMaxRetests: number;
  inducementLookback: number; useBreakout: boolean; boMult: number; boAvgLen: number; boLookback: number; threshold: number; gateStructure: boolean; minOthers: number; heatmapWeight: number;
  stopAtr: number; minRR: number; leverage: number; useHtf: boolean; entryOnClose: boolean; exitMode: 0 | 1 | 2;
  feeHyperliquid: number; feeBulk: number; feeBinance: number; slippagePct: number; useSpread: boolean;
  weights: Record<SignalKey, number>;
};
export type SignalKey = "structure" | "fvgob" | "swings" | "breaker" | "inducement" | "rsi" | "ema" | "breakout";
export const SIGNAL_NAMES: Record<SignalKey, string> = {
  structure: "Market structure (BoS / ChoCH)", fvgob: "FVG / Order block", swings: "HH / HL / LH / LL",
  breaker: "Clean breaker block", inducement: "Inducement sweep", rsi: "RSI context / divergence", ema: "EMA trend", breakout: "Breakout with volume",
};
export const DEFAULTS: Settings = {
  swingLen: 3, rsiLen: 14, rsiOB: 70, rsiOS: 30, divLookback: 30,
  emaFast: 21, emaSlow: 50, atrLen: 14,
  fvgMinAtr: 0.1, obMustBreak: true, obMaxAgeBars: 120, breakerMaxRetests: 1,
  inducementLookback: 20, useBreakout: true, boMult: 1.5, boAvgLen: 20, boLookback: 10, threshold: 0, gateStructure: true, minOthers: 3, heatmapWeight: 0.5,
  stopAtr: 1.5, minRR: 2, leverage: 5, useHtf: false, entryOnClose: true, exitMode: 0, // from docs/BACKTEST.md (v2.1 study)
  feeHyperliquid: 0.045, feeBulk: 0.05, feeBinance: 0.1, slippagePct: 0, useSpread: true,
  weights: { structure: 1, fvgob: 1, swings: 1, breaker: 1, inducement: 1, rsi: 1, ema: 1, breakout: 1 },
};
type Meta = { key: keyof Settings; label: string; min: number; max: number; step: number; group: string; help?: string };
export const PARAMS: Meta[] = [
  { key: "swingLen", label: "Swing length", min: 1, max: 10, step: 1, group: "Structure", help: "Bars each side for a confirmed swing" },
  { key: "fvgMinAtr", label: "FVG min size (× ATR)", min: 0, max: 2, step: 0.05, group: "Structure" },
  { key: "obMaxAgeBars", label: "OB max age (bars)", min: 10, max: 500, step: 10, group: "Structure" },
  { key: "breakerMaxRetests", label: "Breaker max retests", min: 0, max: 5, step: 1, group: "Structure", help: "'Clean' = retested at most this many times" },
  { key: "inducementLookback", label: "Inducement lookback (bars)", min: 3, max: 100, step: 1, group: "Structure" },
  { key: "boMult", label: "Breakout volume (× average)", min: 1, max: 10, step: 0.1, group: "Breakout with volume" },
  { key: "boAvgLen", label: "Breakout volume average (bars)", min: 3, max: 200, step: 1, group: "Breakout with volume" },
  { key: "boLookback", label: "Breakout within last (bars)", min: 1, max: 50, step: 1, group: "Breakout with volume" },
  { key: "rsiLen", label: "RSI length", min: 2, max: 50, step: 1, group: "Momentum" },
  { key: "rsiOB", label: "RSI overbought", min: 50, max: 95, step: 1, group: "Momentum" },
  { key: "rsiOS", label: "RSI oversold", min: 5, max: 50, step: 1, group: "Momentum" },
  { key: "divLookback", label: "Divergence lookback (bars)", min: 5, max: 100, step: 1, group: "Momentum" },
  { key: "emaFast", label: "EMA fast", min: 2, max: 200, step: 1, group: "Momentum" },
  { key: "emaSlow", label: "EMA slow", min: 3, max: 400, step: 1, group: "Momentum" },
  { key: "atrLen", label: "ATR length", min: 2, max: 50, step: 1, group: "Risk" },
  { key: "stopAtr", label: "Stop beyond zone (× ATR) · tested 0.5–2", min: 0, max: 3, step: 0.05, group: "Risk" },
  { key: "leverage", label: "Leverage you plan to use (×) · for your liquidation check", min: 1, max: 50, step: 1, group: "Risk" },
  { key: "minRR", label: "TP1 at R:R (after costs) · tested 1.5 / 2 / 3", min: 0.5, max: 5, step: 0.1, group: "Risk" },
  { key: "feeHyperliquid", label: "Taker fee Hyperliquid (% per side)", min: 0, max: 1, step: 0.005, group: "Spread + fees" },
  { key: "feeBulk", label: "Taker fee Bulk (% per side)", min: 0, max: 1, step: 0.005, group: "Spread + fees" },
  { key: "feeBinance", label: "Taker fee Binance (% per side)", min: 0, max: 1, step: 0.005, group: "Spread + fees", help: "spot default; 0.05 for futures" },
  { key: "slippagePct", label: "Slippage (% per side)", min: 0, max: 2, step: 0.01, group: "Spread + fees", help: "optional, 0 = off" },
  { key: "heatmapWeight", label: "Heatmap weight", min: 0, max: 1, step: 0.05, group: "Risk", help: "0 = ignore the estimated liquidation map" },
  { key: "minOthers", label: "Min other signals agreeing", min: 0, max: 7, step: 1, group: "Confidence", help: "of the 7 non-structure signals (default 3)" },
  { key: "threshold", label: "Extra filter: confidence ≥ %", min: 0, max: 100, step: 5, group: "Confidence", help: "0 = off" },
];
export function sanitize(s: Partial<Settings>): Settings {
  const o: any = { ...DEFAULTS, ...s, weights: { ...DEFAULTS.weights, ...(s.weights ?? {}) } };
  for (const p of PARAMS) { const v = Number(o[p.key]); o[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : (DEFAULTS as any)[p.key]; }
  o.exitMode = [0, 1, 2].includes(Number(o.exitMode)) ? Number(o.exitMode) : 0; o.entryOnClose = o.entryOnClose !== false;
  if (o.emaSlow <= o.emaFast) o.emaSlow = o.emaFast + 1;
  if (o.rsiOS >= o.rsiOB) { o.rsiOS = DEFAULTS.rsiOS; o.rsiOB = DEFAULTS.rsiOB; }
  return o;
}
