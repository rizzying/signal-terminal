import { useEffect, useState } from "react";
import { candles, type Exchange } from "../api/markets";
import { hlSocket } from "../api/live";
import { describeAlert, hits, hitsRange, loadAlerts, notify, saveAlerts, type Alert } from "../alerts";
import { fmt } from "../engine/scan";

/** Polls prices for active alerts every 20s while the app is open. */
export function useAlertWatcher() {
  useEffect(() => {
    const tick = async () => {
      const as = loadAlerts(); const live = as.filter((a) => !a.firedAt); if (!live.length) return;
      const keys = [...new Set(live.map((a) => `${a.exchange}|${a.symbol}`))]; const cs: Record<string, { t: number; h: number; l: number; c: number }[]> = {};
      await Promise.all(keys.map(async (k) => { const [ex, s] = k.split("|"); try { cs[k] = await candles(ex as Exchange, s, "1m", 30); } catch { /* skip */ } }));
      let changed = false;
      for (const a of as) { const c = cs[`${a.exchange}|${a.symbol}`]; if (a.firedAt || !c?.length) continue;
        // 1m candles since the alert was set, so a quick wick through the level between checks still counts
        const since = c.filter((k) => k.t + 6e4 > a.createdAt); if (!since.length) continue;
        const lo = Math.min(...since.map((k) => k.l)), hi = Math.max(...since.map((k) => k.h)), p = c.at(-1)!.c;
        if (hitsRange(a, lo, hi)) { a.firedAt = Date.now(); changed = true; notify(`Signal · ${a.symbol}`, `${a.label} (price ${fmt(p)})`); } }
      if (changed) saveAlerts(as);
    };
    tick(); const t = setInterval(tick, 20_000); return () => clearInterval(t);
  }, []);
  // Instant: Hyperliquid mid prices over the WebSocket (polling above stays as the fallback and covers Bulk/Binance)
  useEffect(() => {
    let off: (() => void) | null = null;
    const sync = () => { const need = loadAlerts().some((a) => !a.firedAt && a.exchange === "hyperliquid");
      if (need && !off) off = hlSocket().subscribe({ type: "allMids" }, (mids: Record<string, string>) => {
        const as = loadAlerts(); let changed = false;
        for (const a of as) { if (a.firedAt || a.exchange !== "hyperliquid") continue; const p = Number(mids[a.symbol]); if (Number.isFinite(p) && hits(a, p)) { a.firedAt = Date.now(); changed = true; notify(`Signal · ${a.symbol}`, `${a.label} (price ${fmt(p)})`); } }
        if (changed) saveAlerts(as); });
      else if (!need && off) { off(); off = null; } };
    sync(); addEventListener("sig-alerts", sync); return () => { removeEventListener("sig-alerts", sync); off?.(); };
  }, []);
}
export function AlertsCard() {
  const [as, setAs] = useState<Alert[]>(loadAlerts); const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  useEffect(() => { const f = () => setAs(loadAlerts()); addEventListener("sig-alerts", f); return () => removeEventListener("sig-alerts", f); }, []);
  return (
    <div className="card">
      <div className="cardhead"><h2>Alerts</h2><span className="lbl">while Signal is open</span></div>
      {perm !== "granted" && perm !== "unsupported" && <p className="small">Notifications are {perm}. <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>Allow notifications</button></p>}
      {perm === "unsupported" && <p className="dim small">This browser can't show notifications; alerts will still show here. On iPhone, add Signal to your Home Screen first.</p>}
      {as.length ? <AlertList alerts={as} /> : <p className="dim small">No alerts. After a scan, tap “Alert when price enters zone”, or set a price alert below.</p>}
      <PriceAlertForm />
      <p className="dim small">Checks every 20 seconds and only while this tab or the installed app is open. Nothing is sent to a server.</p>
    </div>
  );
}
function PriceAlertForm() {
  const [v, setV] = useState(""); const ex = (localStorage.getItem("sig.ex") || "hyperliquid"); const sym = localStorage.getItem("sig.sym") || "BTC";
  const add = (kind: "above" | "below") => { const n = +v; if (!(n > 0)) return; addAlert({ exchange: ex, symbol: sym, kind, lo: n, hi: n, label: `price ${kind} ${fmt(n)}` }); setV(""); };
  return <form className="row wrap gap" onSubmit={(e) => e.preventDefault()}><input className="input grow" type="number" step="any" inputMode="decimal" aria-label={`Alert price for ${sym}`} placeholder={`${sym} price`} value={v} onChange={(e) => setV(e.target.value)} /><button className="btn" onClick={() => add("above")}>Above</button><button className="btn" onClick={() => add("below")}>Below</button></form>;
}
/** Every saved alert: coin, timeframe, side or zone, price, and remove. Fired rows stay until removed. */
export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null;
  return (
    <ul className="alerts">
      {alerts.map((a) => {
        const d = describeAlert(a);
        return (
          <li key={a.id}>
            <b className="mono">{d.coin}</b>
            <span className="mono dim">{d.tf}</span>
            <span>{d.sideZone}</span>
            <span className="mono">{d.price}</span>
            {a.firedAt ? <span className="badge long">hit {new Date(a.firedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span> : <span className="badge">watching</span>}
            <button className="btn ghost sm" aria-label={`Remove ${d.coin} ${d.sideZone}`} onClick={() => saveAlerts(loadAlerts().filter((x) => x.id !== a.id))}>Remove</button>
          </li>
        );
      })}
    </ul>
  );
}
export async function addAlert(a: Omit<Alert, "id" | "createdAt">) {
  if (typeof Notification !== "undefined" && Notification.permission === "default") { try { await Notification.requestPermission(); } catch { /* ignore */ } }
  saveAlerts([...loadAlerts(), { ...a, id: Math.random().toString(36).slice(2), createdAt: Date.now() }]);
}
