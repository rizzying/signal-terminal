import { fmt } from "./engine/scan";
// Browser alerts while Signal is open (no server, no push). Stored on this device.
export type Alert = { id: string; exchange: string; symbol: string; label: string; kind: "zone" | "above" | "below"; lo: number; hi: number; createdAt: number; firedAt?: number; tf?: string; side?: "long" | "short"; zone?: number };
/** Coin, timeframe, side/zone, and price for the alert list. Missing fields on older saved alerts stay blank rather than invented. */
export function describeAlert(a: Alert): { coin: string; tf: string; sideZone: string; price: string } {
  const parsed = a.label.match(/^(long|short)\s+Zone\s+(\d+)/i);
  const side = a.side ?? (parsed ? (parsed[1].toLowerCase() as "long" | "short") : undefined);
  const zone = a.zone ?? (parsed ? Number(parsed[2]) : undefined);
  const sideZone = side && zone ? `${side} · Zone ${zone}` : a.kind === "above" || a.kind === "below" ? a.kind : "zone";
  const price = a.kind === "zone" && a.lo !== a.hi ? `${fmt(a.lo)}–${fmt(a.hi)}` : fmt(a.lo);
  return { coin: a.symbol, tf: a.tf ? a.tf.toUpperCase() : "—", sideZone, price };
}
const K = "sig.alerts";
export const loadAlerts = (): Alert[] => { try { return JSON.parse(localStorage.getItem(K) || "[]"); } catch { return []; } };
export const saveAlerts = (a: Alert[]) => { localStorage.setItem(K, JSON.stringify(a)); dispatchEvent(new Event("sig-alerts")); };
export function hits(a: Alert, price: number) { return a.kind === "zone" ? price >= a.lo && price <= a.hi : a.kind === "above" ? price >= a.lo : price <= a.lo; }
/** Did price trade through the alert between checks? lo/hi = lowest/highest traded price since the alert was set. */
export function hitsRange(a: Alert, lo: number, hi: number) { return a.kind === "zone" ? lo <= a.hi && hi >= a.lo : a.kind === "above" ? hi >= a.lo : lo <= a.lo; }
export async function notify(title: string, body: string) {
  try { if ("Notification" in window && Notification.permission === "granted") { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification(title, { body, icon: "/icons/icon-192.png" }); else new Notification(title, { body }); } } catch { /* ignore */ }
  try { navigator.vibrate?.(200); } catch { /* ignore */ }
}
