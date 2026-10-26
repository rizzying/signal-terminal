import { useEffect, useState } from "react";
import { candles, marketsCached, roundTick, type Exchange, type TF } from "../api/markets";
import { fmt, MIN_CANDLES, roundSetup, scan, type Setup } from "../engine/scan";
import { mmrFor } from "../engine/liq";
import type { Settings } from "../engine/settings";
import { loadAlerts, type Alert } from "../alerts";
import { AlertList } from "./Alerts";
import { bestShown, rankShown, shortfall, todaySymbols } from "./todayRank";
import { loadSnap, watchSymbols } from "./Watchlist";
import { PMOdds, type CalEvent } from "./Calendar";
import { useVisibleInterval } from "./useVisibleInterval";

const EXN: Record<Exchange, string> = { hyperliquid: "Hyperliquid", bulk: "Bulk", binance: "Binance" };
const wib = (t: number) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export function countdown(ms: number) { if (ms <= 0) return "now"; const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${String(x).padStart(2, "0")}s` : `${m}m ${String(x).padStart(2, "0")}s`; }
/** Pick the next event: the soonest one still in the future (events at the same minute are grouped). */
export function nextEvent(evs: CalEvent[], now: number) { const f = evs.filter((e) => Date.parse(e.time) > now).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); if (!f.length) return null; const t = f[0].time; const events = f.filter((e) => e.time === t); return { time: Date.parse(t), titles: events.map((e) => e.title), events }; }

export type Pulse = { coin: string; px: number; chg: number; funding: number };
/** Market pulse from one Hyperliquid metaAndAssetCtxs response: price, 24h change, hourly funding. */
export function parsePulse(j: any, coins = ["BTC", "ETH", "SOL", "HYPE"]): Pulse[] { const [meta, ctx] = j ?? []; if (!meta?.universe || !Array.isArray(ctx)) return [];
  return coins.flatMap((c) => { const i = meta.universe.findIndex((u: any) => u.name === c); const x = ctx[i]; if (i < 0 || !x) return []; const px = +x.markPx, p0 = +x.prevDayPx; return [{ coin: c, px, chg: p0 ? (px - p0) / p0 : 0, funding: +x.funding }]; }); }

function Tile({ title, go, label, children }: { title: string; go: () => void; label: string; children: React.ReactNode }) {
  return <section className="card tile"><div className="cardhead"><h2>{title}</h2><button className="btn ghost sm" onClick={go}>{label} →</button></div>{children}</section>;
}
export function TodayView({ settings, go, onScan }: { settings: Settings; go: (tab: "scan" | "watch" | "calendar") => void; onScan: (ex: Exchange, sym: string, tf: TF, dir: "long" | "short") => void }) {
  const ex = (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid"; const sym = localStorage.getItem("sig.sym") || "BTC"; const tf = (localStorage.getItem("sig.tf") as TF) || "4h";
  const [board, setBoard] = useState<{ symbol: string; setup: Setup }[] | "err" | null>(null);
  useEffect(() => { let live = true; const symbols = todaySymbols(sym, watchSymbols(ex)); (async () => {
    try {
      const ms = await marketsCached(ex).catch(() => []); const found: { symbol: string; setup: Setup; confidence: number; rr: number }[] = []; let reached = 0;
      await Promise.all(symbols.map(async (symbol) => {
        try {
          const c = await candles(ex, symbol, tf, 400); reached++; if (c.length < MIN_CANDLES) return;
          const mk = ms.find((m) => m.symbol === symbol); const tick = mk?.tick; const o = { maxLev: mk?.maxLev, mmr: mmrFor(ex, mk?.maxLev) };
          const round = (s: Setup) => (tick ? roundSetup(s, (p, m) => roundTick(p, tick, m)) : s);
          const L = round(scan(c, "long", settings, o)), S = round(scan(c, "short", settings, o));
          const rr = (s: Setup) => Math.max(...s.zones.map((z) => z.rr1));
          const side = bestShown({ dir: "long", confidence: L.confidence, shown: L.shown, rr: rr(L) }, { dir: "short", confidence: S.confidence, shown: S.shown, rr: rr(S) });
          if (!side) return; const setup = side === "long" ? L : S; found.push({ symbol, setup, confidence: setup.confidence, rr: rr(setup) });
        } catch { /* this coin is skipped, not shown as a setup */ }
      }));
      if (!live) return;
      if (!reached) { setBoard("err"); return; }
      setBoard(rankShown(found).map(({ symbol, setup }) => ({ symbol, setup })));
    } catch { if (live) setBoard("err"); }
  })(); return () => { live = false; }; }, [ex, sym, tf, settings]);
  const wex = (localStorage.getItem("sig.watch.lastEx") as Exchange) || ex; const snap = loadSnap(wex);
  const wtf = snap?.tf ?? tf; const wsyms = watchSymbols(wex).slice(0, 12); const byS = new Map((snap?.ex === wex ? snap.rows : []).map((r) => [r.symbol, r]));
  const [pulse, setPulse] = useState<Pulse[] | "err" | null>(null);
  useEffect(() => { fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "metaAndAssetCtxs" }) }).then((r) => r.json()).then((j) => { const p = parsePulse(j); setPulse(p.length ? p : "err"); }).catch(() => setPulse("err")); }, []);
  const [ev, setEv] = useState<ReturnType<typeof nextEvent> | "err" | undefined>(undefined);
  useEffect(() => { fetch("/api/calendar").then((r) => (r.ok ? r.json() : Promise.reject())).then((c) => setEv(nextEvent(c.events, Date.now()))).catch(() => setEv("err")); }, []);
  const [now, setNow] = useState(Date.now()); useVisibleInterval(() => setNow(Date.now()), 1000, []);
  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts); useEffect(() => { const f = () => setAlerts(loadAlerts()); addEventListener("sig-alerts", f); return () => removeEventListener("sig-alerts", f); }, []);
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
  const gap = board && board !== "err" ? shortfall(board.length) : null;
  return (
    <div className="today rise">
      <div className="today-top">
      <Tile title="Setups" go={() => go("scan")} label="Open scan">
        <p className="dim small">{EXN[ex]} · {tf.toUpperCase()} · one setup per coin, best ranked. Confidence is signals agreeing, not win chance.</p>
        {board === null ? <p className="dim" role="status">Scanning…</p> : board === "err" ? <p className="dim">Couldn't load prices right now.</p> :
          <><ul className="setups">{board.map(({ symbol, setup }) => { const z = setup.zones[1] ?? setup.zones[0]; return <li key={symbol}>
            <div className="row gap wrap"><b className="mono">{symbol}</b><span className={`badge ${setup.dir}`}>{setup.dir}</span><span className="dim small">{setup.band} · {setup.confidence}%</span>{z?.strength && <span className={`zstr zstr-${z.strength.toLowerCase()}`}>Zone {z.rank} {z.strength}</span>}</div>
            {z && <dl className="tkv"><div><dt>Entry</dt><dd className="mono">{fmt(z.bottom)}–{fmt(z.top)}</dd></div><div><dt>Stop</dt><dd className="mono">{fmt(z.stop)}</dd></div><div><dt>TP1</dt><dd className="mono">{fmt(z.t1)} <span className="dim">({z.rr1.toFixed(1)}R)</span></dd></div></dl>}
            <button className="btn sm" onClick={() => onScan(ex, symbol, tf, setup.dir)}>Open {symbol}</button>
          </li>; })}</ul>{gap && <p className="note" role="status">{gap}</p>}</>}
        <div className="tile-foot small">{!alerts.length ? <span className="dim">No alerts. Set one from a zone on Scan.</span> : <AlertList alerts={alerts} />}</div>
      </Tile>
      <Tile title="Next event" go={() => go("calendar")} label="Calendar">
        {ev === undefined ? <p className="skel" role="status">Loading…</p> : ev === "err" || ev === null ? <p className="dim">{ev === null ? "No more high-impact US events this month." : "Calendar unavailable right now."}</p> :
          <><p className="big mono" aria-live="off">{countdown(ev.time - now)}</p><p className="dim small">{wib(ev.time)} WIB{ev.events.length > 1 ? ` · ${ev.events.length} releases` : ""}</p>
          {(() => { const e = ev.events.find((x) => x.polymarket) ?? ev.events[0]; return <div className="evx"><p className="small"><b>{e.title}</b>{ev.events.length > 1 && <span className="dim"> +{ev.events.length - 1} more</span>}</p>
            {e.forecast == null && e.previous == null ? <p className="dim small">No forecast or previous value yet.</p> :
              <div className="stats"><div><span className="lbl">Forecast</span><b className="mono">{e.forecast ?? "none yet"}</b></div>{e.previous != null && <div><span className="lbl">Previous</span><b className="mono">{e.previous}</b></div>}</div>}
            {e.polymarket ? <PMOdds pm={{ ...e.polymarket, outcomes: e.polymarket.outcomes.slice(0, 3) }} /> : <p className="dim small">No Polymarket market for this event.</p>}</div>; })()}</>}
      </Tile>
      <Tile title="Market pulse" go={() => go("scan")} label="Scan">
        <p className="dim small">Hyperliquid · 24h change · funding per hour</p>
        {pulse === null ? <p className="skel" role="status">Loading…</p> : pulse === "err" ? <p className="dim">Prices unavailable right now.</p> :
          <ul className="pulse">{pulse.map((p) => <li key={p.coin}><b>{p.coin}</b><span className="mono">{fmt(p.px)}</span><span className={`mono ${p.chg >= 0 ? "pos" : "neg"}`}>{pct(p.chg)}</span><span className="mono dim">{(p.funding * 100).toFixed(4)}%</span></li>)}</ul>}
      </Tile>
      </div>
      <section className="card tile today-watch">
        <div className="cardhead"><h2>Watchlist</h2><span className="row gap"><span className="lbl">{EXN[wex]} · {wtf.toUpperCase()}{snap ? ` · last scan ${new Date(snap.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span><button className="btn ghost sm" onClick={() => go("watch")}>Edit list →</button></span></div>
        <ul className="wlrows">{wsyms.map((s) => { const r = byS.get(s); return <li key={s}>
          <b className="mono">{s}</b>
          <span className="small">{r?.dir ? <><span className={`badge ${r.dir}`}>{r.dir}</span> {r.shown ? "rule met" : <span className="dim">no setup</span>} <span className="dim">· {r.band} {r.confidence}%</span>{r.isNew && <span className="badge new">New</span>}</> : <span className="dim">not scanned yet</span>}</span>
          <span className="row gap"><button className="btn long sm" onClick={() => onScan(wex, s, wtf, "long")} aria-label={`Scan long ${s}`}>Scan long</button><button className="btn short sm" onClick={() => onScan(wex, s, wtf, "short")} aria-label={`Scan short ${s}`}>Scan short</button></span>
        </li>; })}</ul>
        <p className="dim small">Scan opens the Scan tab with that result loaded.</p>
      </section>
      <p className="dim small center">Not financial advice. Confidence = signals agreeing, not win chance.</p>
    </div>
  );
}
