// Labs: experimental features, off by default, stored on this device only.
import { useEffect, useState } from "react";
export type Labs = { backtest: boolean; forward: boolean };
export const LAB_TABS = ["backtest", "forward"] as const;
/** A tab id is hidden unless its Labs flag is on. */
export function labAllowed(id: string, l: Labs): boolean { return id === "backtest" ? l.backtest : id === "forward" ? l.forward : true; }
const KEY = "sig.labs";
export function getLabs(): Labs { try { return { backtest: false, forward: false, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { backtest: false, forward: false }; } }
export function setLabs(l: Labs) { localStorage.setItem(KEY, JSON.stringify(l)); dispatchEvent(new Event("sig-labs")); }
export function useLabs(): Labs { const [l, set] = useState(getLabs); useEffect(() => { const f = () => set(getLabs()); addEventListener("sig-labs", f); addEventListener("storage", f); return () => { removeEventListener("sig-labs", f); removeEventListener("storage", f); }; }, []); return l; }
