// Browser alerts while Signal is open (no server, no push). Stored on this device.
export type Alert = { id: string; exchange: string; symbol: string; label: string; kind: "zone" | "above" | "below"; lo: number; hi: number; createdAt: number; firedAt?: number };
const K = "sig.alerts";
export const loadAlerts = (): Alert[] => { try { return JSON.parse(localStorage.getItem(K) || "[]"); } catch { return []; } };
export const saveAlerts = (a: Alert[]) => { localStorage.setItem(K, JSON.stringify(a)); dispatchEvent(new Event("sig-alerts")); };
export function hits(a: Alert, price: number) { return a.kind === "zone" ? price >= a.lo && price <= a.hi : a.kind === "above" ? price >= a.lo : price <= a.lo; }
export async function notify(title: string, body: string) {
  try { if ("Notification" in window && Notification.permission === "granted") { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification(title, { body, icon: "/icons/icon-192.png" }); else new Notification(title, { body }); } } catch { /* ignore */ }
  try { navigator.vibrate?.(200); } catch { /* ignore */ }
}
