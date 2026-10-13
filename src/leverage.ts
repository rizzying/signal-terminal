// Leverage you plan to use, saved per strategy on this device (so editing it doesn't mark the strategy as "edited").
import { useEffect, useState } from "react";
const KEY = "sig.lev";
const all = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
export const getLev = (strat: string, fallback: number) => { const v = all()[strat]; return Number.isFinite(v) && v >= 1 ? v : fallback; };
export function setLev(strat: string, v: number) { localStorage.setItem(KEY, JSON.stringify({ ...all(), [strat]: v })); dispatchEvent(new Event("sig-lev")); }
export function useLev(strat: string, fallback: number): number {
  const [v, set] = useState(() => getLev(strat, fallback));
  useEffect(() => { const f = () => set(getLev(strat, fallback)); f(); addEventListener("sig-lev", f); addEventListener("storage", f); return () => { removeEventListener("sig-lev", f); removeEventListener("storage", f); }; }, [strat, fallback]);
  return v;
}
