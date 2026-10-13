// Labs: experimental features, off by default, stored on this device only.
import { useEffect, useState } from "react";
export type Labs = { backtest: boolean };
const KEY = "sig.labs";
export function getLabs(): Labs { try { return { backtest: false, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { backtest: false }; } }
export function setLabs(l: Labs) { localStorage.setItem(KEY, JSON.stringify(l)); dispatchEvent(new Event("sig-labs")); }
export function useLabs(): Labs { const [l, set] = useState(getLabs); useEffect(() => { const f = () => set(getLabs()); addEventListener("sig-labs", f); addEventListener("storage", f); return () => { removeEventListener("sig-labs", f); removeEventListener("storage", f); }; }, []); return l; }
