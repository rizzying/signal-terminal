// "Bar magnifier": settle ambiguous candles by replaying them with smaller candles.
import type { Candle } from "./indicators";
import type { Amb, Resolution } from "./sim";
import { TF_MS, type TF } from "../api/markets";
export const HL_LIMIT = 5000;
/** Finer intervals to try for each chart timeframe, finest first. */
export const LTF: Record<TF, TF[]> = { "1m": [], "5m": ["1m"], "15m": ["1m", "5m"], "1h": ["1m", "5m", "15m"], "4h": ["5m", "15m", "1h"], "12h": ["15m", "1h"], "1d": ["15m", "1h", "4h"], "3d": ["1h", "4h"], "1w": ["4h", "1d"] };
/** Finest interval Hyperliquid still serves for a candle at time t (it keeps ~5000 candles per interval). */
export function pickLtf(tf: TF, t: number, now = Date.now()): TF | null { return LTF[tf].find((l) => t >= now - (HL_LIMIT - 10) * TF_MS[l]) ?? null; }
/** Decide what happened first inside one candle. Sub-candles that touch both levels count as stop (still ambiguous at that zoom). */
export function resolve(a: Amb, sub: Candle[]): Resolution | null {
  if (!sub.length) return null; const L = a.dir === "long";
  const hitS = (k: Candle) => (L ? k.l <= a.stop : k.h >= a.stop); const hitT = (k: Candle) => (L ? k.h >= a.tgt : k.l <= a.tgt);
  let j = 0;
  if (a.kind === "entry") { const touch = (k: Candle) => (L ? k.l <= a.fill! : k.h >= a.fill!); while (j < sub.length && !touch(sub[j])) j++; if (j === sub.length) return null; }
  for (; j < sub.length; j++) { if (hitS(sub[j])) return "stop"; if (hitT(sub[j])) return "tp"; }
  return a.kind === "entry" ? "none" : null;
}
