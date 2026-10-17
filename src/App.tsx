import { lazy, Suspense, useEffect, useState } from "react";
import { DEFAULTS, sanitize, type Settings } from "./engine/settings";
import { db, uid, type Trade } from "./journal/db";
import type { Draft } from "./ui/Scan";
import { useAlertWatcher } from "./ui/Alerts";
import { useLabs, labAllowed } from "./labs";
import { activeId, setActiveId, type Strategy } from "./strategies";

type Tab = "forward" | "today" | "scan" | "market" | "watch" | "backtest" | "calendar" | "wallets" | "journal" | "settings";
const ALL_TABS: { id: Tab; name: string; more?: boolean; labs?: boolean }[] = [{ id: "today", name: "Today" }, { id: "scan", name: "Scan" }, { id: "market", name: "Market" }, { id: "watch", name: "Watchlist" }, { id: "forward", name: "Forward test", more: true, labs: true }, { id: "backtest", name: "Backtest", more: true, labs: true }, { id: "calendar", name: "Calendar", more: true }, { id: "wallets", name: "Wallets", more: true }, { id: "journal", name: "Journal" }, { id: "settings", name: "Settings", more: true }];
const Watchlist = lazy(() => import("./ui/Watchlist").then((m) => ({ default: m.Watchlist })));
const Wallets = lazy(() => import("./ui/Wallets").then((m) => ({ default: m.Wallets })));
const MarketView = lazy(() => import("./ui/Market").then((m) => ({ default: m.MarketView })));
const BacktestView = lazy(() => import("./ui/Backtest").then((m) => ({ default: m.BacktestView })));
const CalendarView = lazy(() => import("./ui/Calendar").then((m) => ({ default: m.CalendarView })));
const JournalView = lazy(() => import("./ui/Journal").then((m) => ({ default: m.JournalView })));
const SettingsView = lazy(() => import("./ui/SettingsView").then((m) => ({ default: m.SettingsView })));
const ScanView = lazy(() => import("./ui/Scan").then((m) => ({ default: m.ScanView })));
const ForwardView = lazy(() => import("./ui/Forward").then((m) => ({ default: m.ForwardView })));
const TodayView = lazy(() => import("./ui/Today").then((m) => ({ default: m.TodayView })));
export default function App() {
  useAlertWatcher();
  const [more, setMore] = useState(false);
  const labs = useLabs(); const TABS = ALL_TABS.filter((t) => labAllowed(t.id, labs));
  const [tab, setTab] = useState<Tab>(() => { const h = location.hash.slice(1) as Tab; return h || "today"; });
  useEffect(() => { if (tab === "backtest" && !labs.backtest) setTab("scan"); }, [tab, labs.backtest]);
  const [settings, setSettingsS] = useState<Settings>(DEFAULTS); const [prefill, setPrefill] = useState<Trade | null>(null);
  const [stratId, setStratId] = useState("b-default");
  const [ready, setReady] = useState(false); // settings + strategy loaded from IndexedDB before the first scan (avoids a double scan and layout shift)
  useEffect(() => { (async () => { try {
    let s = await db.get<Settings>("settings"); const v = (await db.get<number>("settingsV")) ?? 0;
    if (v < 5) { // v1.5 migration: min R:R default becomes 3 (current settings + saved presets)
      if (s) s = { ...s, minRR: 3, ...((s as any).gateStructure === undefined ? { threshold: 0, useHtf: false } : {}) };
      const ps = await db.get<any[]>("presets"); if (ps?.length) await db.set("presets", ps.map((p) => ({ ...p, settings: { ...p.settings, minRR: 3 } })));
      if (s) await db.set("settings", s); await db.set("settingsV", 5);
    }
    if (v < 6) { // v2.1: backtest-study defaults (stop 1.5×ATR, TP1 at 2R, enter on close in zone) if the old defaults were untouched
      if (s && s.stopAtr === 0.25 && s.minRR === 3) s = { ...s, stopAtr: 1.5, minRR: 2, entryOnClose: true, exitMode: 0 };
      if (s) await db.set("settings", s); await db.set("settingsV", 6);
    }
    if (s) setSettingsS(sanitize(s)); setStratId(await activeId());
  } catch { /* storage blocked: run with defaults */ } finally { setReady(true); } })(); }, []);
  const setSettings = (s: Settings) => { setSettingsS(s); db.set("settings", s); };
  const pickStrategy = (s: Strategy) => { setSettings(s.settings); setStratId(s.id); setActiveId(s.id); };
  useEffect(() => { document.documentElement.classList.add("dark"); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#edeff2"); }, []);
  useEffect(() => { const f = () => { const h = location.hash.slice(1) as Tab; if (ALL_TABS.some((t) => t.id === h)) setTab(h); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { history.replaceState(null, "", `#${tab}`); window.scrollTo(0, 0); }, [tab]);
  const journal = (d: Draft) => {
    const z = d.setup.zones[d.zone];
    setPrefill({ id: uid(), createdAt: Date.now(), exchange: d.exchange, symbol: d.symbol, tf: d.tf, side: d.setup.dir, entry: +z.entry.toPrecision(8), stop: +z.stop.toPrecision(8), size: 0,
      signals: d.setup.signals.filter((s) => s.pass).map((s) => s.name), confidence: d.setup.confidence, zone: z.rank, settings, checklist: d.checklist, source: "scan", leverage: d.leverage, liq: d.liq != null ? +d.liq.toPrecision(8) : undefined });
    setTab("journal");
  };
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#scan" onClick={() => setTab("scan")}><span className="dot" aria-hidden />Signal</a>
        <nav className="nav" aria-label="Main">{TABS.map((t) => <button key={t.id} className={`${tab === t.id ? "on" : ""} ${t.more ? "is-more" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); setMore(false); }}>{t.id === "watch" ? <>Watch<span className="lg">list</span></> : t.name}{t.labs && <span className="labs-badge">Labs</span>}</button>)}
          <button className={`more-btn ${TABS.some((t) => t.more && t.id === tab) ? "on" : ""}`} aria-expanded={more} aria-haspopup="menu" onClick={() => setMore(!more)}>More</button>
          {more && <div className="more-menu" role="menu">{TABS.filter((t) => t.more).map((t) => <button key={t.id} role="menuitem" className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); setMore(false); }}>{t.name}{t.labs && <span className="labs-badge">Labs</span>}</button>)}</div>}
        </nav>
      </header>
      <main className={`pg-${tab}`}>
        {!ready ? <p className="dim small center" role="status">Loading…</p> : <>
        <Suspense fallback={<p className="dim small center" role="status">Loading…</p>}>
        {tab === "forward" && (labs.forward ? <ForwardView /> : <section className="card stack" data-labs-off><h2>Forward test</h2><p className="dim">This is a Labs feature. Turn on "Forward test" under Labs in Settings to see it.</p></section>)}
        {tab === "today" && <TodayView settings={settings} go={setTab} onScan={(ex, sym, tf, dir) => { localStorage.setItem("sig.ex", ex); localStorage.setItem("sig.sym", sym); localStorage.setItem("sig.tf", tf); sessionStorage.setItem("sig.autoscan", dir); setTab("scan"); }} />}
        {tab === "scan" && <ScanView stratId={stratId} onPickStrategy={pickStrategy} settings={settings} theme="dark" onJournal={journal} />}
        {tab === "watch" && <Watchlist settings={settings} onOpen={(ex, sym, tf) => { localStorage.setItem("sig.ex", ex); localStorage.setItem("sig.sym", sym); localStorage.setItem("sig.tf", tf); setTab("scan"); }} />}
        {tab === "market" && <MarketView />}
        {tab === "backtest" && labs.backtest && <BacktestView settings={settings} stratId={stratId} theme="dark" />}
        {tab === "calendar" && <CalendarView />}
        {tab === "wallets" && <Wallets />}
        {tab === "journal" && <JournalView prefill={prefill} clearPrefill={() => setPrefill(null)} />}
        {tab === "settings" && <SettingsView settings={settings} setSettings={setSettings} stratId={stratId} onPickStrategy={pickStrategy} />}
        </Suspense></>}
      </main>
      <footer className="foot dim small">Signal v3.6.0 · <a href="/welcome">About</a> · Public market data only · no accounts · journal never leaves this device · not financial advice</footer>
    </div>
  );
}
