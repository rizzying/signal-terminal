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
// Pretend risk per trade ($) for the Forward test page: display only, saved on this device.
export const RISK_KEY = "sig.riskUsd", RISK_DEFAULT = 100;
export function getRisk(): number { try { const v = Number(localStorage.getItem(RISK_KEY)); return Number.isFinite(v) && v > 0 ? v : RISK_DEFAULT; } catch { return RISK_DEFAULT; } }
export function setRisk(v: number) { if (Number.isFinite(v) && v > 0) { localStorage.setItem(RISK_KEY, String(v)); dispatchEvent(new Event("sig-labs")); } }
export function useRisk(): number { const [r, set] = useState(getRisk); useEffect(() => { const f = () => set(getRisk()); addEventListener("sig-labs", f); addEventListener("storage", f); return () => { removeEventListener("sig-labs", f); removeEventListener("storage", f); }; }, []); return r; }
/** R × risk → "+$59" / "-$300" (whole dollars, cents under $10). */
export function usd(r: number | null | undefined, risk: number): string { if (r == null || !Number.isFinite(r)) return "–"; const v = r * risk, a = Math.abs(v); const s = a < 10 && a > 0 ? a.toFixed(2) : Math.round(a).toLocaleString("en-US"); return `${v < 0 && s !== "0" ? "-" : v > 0 ? "+" : ""}$${s}`; }
