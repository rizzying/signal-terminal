import { fmt } from "../engine/scan";
import type { ZoneGrade } from "../engine/zoneStrength";
export type CopyZone = { rank: number; name: string; bottom: number; top: number; stop: number; t1: number; t2: number; rr1: number; rr2: number; strength?: ZoneGrade };
export type CopyInput = { market: string; exchange: string; tf: string; dir: "long" | "short"; zone: CopyZone; confidence: number; band: string; lev: number | null; liq: number | null; liqBeforeStop?: boolean; at: number };
const wib = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
/** Plain-text setup for the clipboard (one line per field). */
export function setupText(c: CopyInput): string {
  const z = c.zone;
  return [
    `${c.market} · ${c.exchange} · ${c.tf.toUpperCase()} · ${c.dir.toUpperCase()}`,
    `Zone ${z.rank} (${z.name})`,
    ...(z.strength ? [`Zone strength: ${z.strength}`] : []),
    `Entry: ${fmt(z.bottom)} – ${fmt(z.top)}`,
    `Stop: ${fmt(z.stop)}`,
    `TP1: ${fmt(z.t1)} · TP2: ${fmt(z.t2)}`,
    `R:R (net of costs): ${z.rr1.toFixed(1)}R / ${z.rr2.toFixed(1)}R`,
    c.lev == null || c.liq == null ? "Leverage: spot, no liquidation" : `Leverage: ${c.lev}× · est. liquidation ${fmt(c.liq)}${c.liqBeforeStop ? " (before stop!)" : ""}`,
    `Confidence: ${c.band} (${c.confidence}%, signals agreeing, not win chance)`,
    `Time: ${wib(c.at)} WIB`,
    "Signal · not financial advice",
  ].join("\n");
}
/** Copy text; resolves false when clipboard access is denied or unavailable. */
export async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    try { const a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); const ok = document.execCommand("copy"); a.remove(); return ok; } catch { return false; }
  }
}
export const TOAST_MS = 2500;
/** Which zone a chart click at this price falls in (−1 if none). Small padding so thin bands are clickable. */
export function zoneAtPrice(zs: { bottom: number; top: number }[], p: number): number {
  return zs.findIndex((z) => { const pad = Math.max((z.top - z.bottom) * 0.15, z.top * 0.0005); return p >= z.bottom - pad && p <= z.top + pad; });
}
