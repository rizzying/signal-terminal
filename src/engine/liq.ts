// Your own estimated liquidation price (isolated margin, fees/funding ignored). An estimate, not the exchange's number.
import type { Exchange } from "../api/markets";
/** Maintenance margin rate. Hyperliquid documents half the initial margin at max leverage (1 / (2·maxLev)); Bulk is assumed the same; otherwise 0.5%. */
export function mmrFor(ex: Exchange, maxLev?: number) { return (ex === "hyperliquid" || ex === "bulk") && maxLev ? 1 / (2 * maxLev) : 0.005; }
export function liqPrice(entry: number, dir: "long" | "short", lev: number, mmr: number) { const k = 1 / lev - mmr; return dir === "long" ? entry * (1 - k) : entry * (1 + k); }
/** Highest whole leverage whose liquidation still sits beyond the stop (with a 10% safety gap on the distance). */
export function maxSafeLev(entry: number, stop: number, mmr: number, cap = 100) { const d = Math.abs(entry - stop) / entry; return Math.max(1, Math.min(cap, Math.floor(1 / (d * 1.1 + mmr)))); }
export type LiqCheck = { liq: number; beforeStop: boolean; maxSafe: number };
export function checkLiq(z: { entry: number; stop: number }, dir: "long" | "short", lev: number, mmr: number, cap?: number): LiqCheck {
  const liq = liqPrice(z.entry, dir, lev, mmr); const beforeStop = dir === "long" ? liq >= z.stop : liq <= z.stop; return { liq, beforeStop, maxSafe: maxSafeLev(z.entry, z.stop, mmr, cap) };
}
