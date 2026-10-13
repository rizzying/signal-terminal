import { useEffect, useState } from "react";
import { candles, marketsCached, roundTick, type Exchange, type TF } from "../api/markets";
import { fmt, MIN_CANDLES, roundSetup, scan, type Setup } from "../engine/scan";
import type { Settings } from "../engine/settings";
import { loadAlerts, type Alert } from "../alerts";
import { loadSnap } from "./Watchlist";
import type { CalEvent } from "./Calendar";
import { useVisibleInterval } from "./useVisibleInterval";

const EXN: Record<Exchange, string> = { hyperliquid: "Hyperliquid", bulk: "Bulk", binance: "Binance" };
const wib = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export function countdown(ms: number) { if (ms <= 0) return "now"; const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${String(x).padStart(2, "0")}s` : `${m}m ${String(x).padStart(2, "0")}s`; }
/** Pick the next event: the soonest one still in the future (events at the same minute are grouped). */
export function nextEvent(evs: CalEvent[], now: number) { const f = evs.filter((e) => Date.parse(e.time) > now).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); if (!f.length) return null; const t = f[0].time; return { time: Date.parse(t), titles: f.filter((e) => e.time === t).map((e) => e.title) }; }

function Tile({ title, go, label, children }: { title: string; go: () => void; label: string; children: React.ReactNode }) {
  return <section className="card tile"><div className="cardhead"><h2>{title}</h2><button className="btn ghost sm" onClick={go}>{label} →</button></div>{children}</section>;
}
export function TodayView({ settings, go }: { settings: Settings; go: (tab: "scan" | "watch" | "calendar") => void }) {
  const ex = (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid"; const sym = localStorage.getItem("sig.sym") || "BTC"; const tf = (localStorage.getItem("sig.tf") as TF) || "4h";
  const [best, setBest] = useState<Setup | null | "err" | "short">(null);
  useEffect(() => { let live = true; (async () => {
    try { const [c, ms] = await Promise.all([candles(ex, sym, tf, 400), marketsCached(ex).catch(() => [])]); if (c.length < MIN_CANDLES) { live && setBest("short"); return; }
      const tick = ms.find((m) => m.symbol === sym)?.tick; const r = (s: Setup) => (tick ? roundSetup(s, (p, m) => roundTick(p, tick, m)) : s);
      const L = scan(c, "long", settings), S = scan(c, "short", settings); const pick = L.shown !== S.shown ? (L.shown ? L : S) : L.confidence >= S.confidence ? L : S; live && setBest(r(pick)); }
    catch { live && setBest("err"); } })(); return () => { live = false; }; }, [ex, sym, tf, settings]);
  const wex = (localStorage.getItem("sig.watch.lastEx") as Exchange) || ex; const snap = loadSnap(wex);
  const top = snap?.rows.filter((r) => r.shown).slice(0, 3) ?? [];
  const [ev, setEv] = useState<ReturnType<typeof nextEvent> | "err" | undefined>(undefined);
  useEffect(() => { fetch("/api/calendar").then((r) => (r.ok ? r.json() : Promise.reject())).then((c) => setEv(nextEvent(c.events, Date.now()))).catch(() => setEv("err")); }, []);
  const [now, setNow] = useState(Date.now()); useVisibleInterval(() => setNow(Date.now()), 1000, []);
  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts); useEffect(() => { const f = () => setAlerts(loadAlerts()); addEventListener("sig-alerts", f); return () => removeEventListener("sig-alerts", f); }, []);
  const active = alerts.filter((a) => !a.firedAt); const hit = alerts.filter((a) => a.firedAt);
  const z = best && typeof best === "object" ? best.zones[1] : null;
  return (
    <div className="today stack rise">
      <Tile title={`${sym} · ${tf.toUpperCase()}`} go={() => go("scan")} label="Open scan">
        <p className="dim small">{EXN[ex]} · current setup</p>
        {best === null ? <p className="dim" role="status">Scanning…</p> : best === "err" ? <p className="dim">Couldn't load prices right now.</p> : best === "short" ? <p className="dim">Not enough history on this timeframe.</p> :
          <><p className="big"><span className={`badge ${best.dir}`}>{best.dir}</span> {best.shown ? <b>Setup rule met</b> : <span className="dim">No setup yet</span>} <span className="dim">· {best.band} confidence ({best.confidence}%)</span></p>
          {z && <dl className="tkv"><div><dt>Zone 2 entry</dt><dd className="mono">{fmt(z.bottom)}–{fmt(z.top)}</dd></div><div><dt>Stop</dt><dd className="mono">{fmt(z.stop)}</dd></div><div><dt>TP1</dt><dd className="mono">{fmt(z.t1)} <span className="dim">({z.rr1.toFixed(1)}R)</span></dd></div></dl>}</>}
      </Tile>
      <Tile title="Watchlist" go={() => go("watch")} label="Open watchlist">
        {!snap ? <p className="dim">No watchlist scan yet. Open the watchlist and run it once; it then refreshes by itself while open.</p> :
          <><p className="dim small">{EXN[snap.ex]} · {snap.tf.toUpperCase()} · updated {new Date(snap.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
          {top.length ? <ul className="list">{top.map((r) => <li key={r.symbol}><b>{r.symbol}</b>{r.isNew && <span className="badge new">New</span>} <span className={`badge ${r.dir}`}>{r.dir}</span> <span className="dim">{r.band} · {r.confidence}%</span></li>)}</ul> : <p className="dim">No setups meet the rule right now.</p>}</>}
      </Tile>
      <Tile title="Next event" go={() => go("calendar")} label="Calendar">
        {ev === undefined ? <p className="dim" role="status">Loading…</p> : ev === "err" || ev === null ? <p className="dim">{ev === null ? "No more high-impact US events this month." : "Calendar unavailable right now."}</p> :
          <><p className="big mono" aria-live="off">{countdown(ev.time - now)}</p><p><b>{ev.titles.slice(0, 2).join(", ")}{ev.titles.length > 2 ? ` +${ev.titles.length - 2} more` : ""}</b></p><p className="dim small">{wib(ev.time)} WIB</p></>}
      </Tile>
      <Tile title="Alerts" go={() => go("scan")} label="Manage">
        {!alerts.length ? <p className="dim">No alerts. Set one from a zone on the Scan tab.</p> :
          <><p className="small">{active.length} watching{hit.length ? ` · ${hit.length} hit` : ""}</p>
          <ul className="list">{[...hit.slice(-2), ...active.slice(0, 3)].slice(0, 4).map((a) => <li key={a.id}><b>{a.symbol}</b> <span className="dim">{a.label}</span> {a.firedAt ? <span className="badge long">hit</span> : <span className="badge">watching</span>}</li>)}</ul></>}
      </Tile>
      <p className="dim small center">Not financial advice. Confidence = signals agreeing, not win chance.</p>
    </div>
  );
}
