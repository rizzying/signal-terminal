import { useEffect, useState } from "react";
import { DEFAULTS, sanitize, type Settings } from "./engine/settings";
import { db, uid, type Trade } from "./journal/db";
import { JournalView } from "./ui/Journal";
import { ScanView, type Draft } from "./ui/Scan";
import { SettingsView } from "./ui/SettingsView";
import { useAlertWatcher } from "./ui/Alerts";
import { Watchlist } from "./ui/Watchlist";
import { Wallets } from "./ui/Wallets";
import { MarketView } from "./ui/Market";

type Tab = "scan" | "market" | "watch" | "wallets" | "journal" | "settings";
const TABS: { id: Tab; name: string; more?: boolean }[] = [{ id: "scan", name: "Scan" }, { id: "market", name: "Market" }, { id: "watch", name: "Watchlist" }, { id: "wallets", name: "Wallets", more: true }, { id: "journal", name: "Journal" }, { id: "settings", name: "Settings", more: true }];
export default function App() {
  useAlertWatcher();
  const [more, setMore] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || "scan");
  const [theme, setTheme] = useState(() => localStorage.getItem("sig.theme") || "dark");
  const [settings, setSettingsS] = useState<Settings>(DEFAULTS); const [prefill, setPrefill] = useState<Trade | null>(null);
  useEffect(() => { (async () => {
    let s = await db.get<Settings>("settings"); const v = (await db.get<number>("settingsV")) ?? 0;
    if (v < 5) { // v1.5 migration: min R:R default becomes 3 (current settings + saved presets)
      if (s) s = { ...s, minRR: 3, ...((s as any).gateStructure === undefined ? { threshold: 0, useHtf: false } : {}) };
      const ps = await db.get<any[]>("presets"); if (ps?.length) await db.set("presets", ps.map((p) => ({ ...p, settings: { ...p.settings, minRR: 3 } })));
      if (s) await db.set("settings", s); await db.set("settingsV", 5);
    }
    if (s) setSettingsS(sanitize(s));
  })(); }, []);
  const setSettings = (s: Settings) => { setSettingsS(s); db.set("settings", s); };
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#08080a" : "#ffffff"); localStorage.setItem("sig.theme", theme); }, [theme]);
  useEffect(() => { const f = () => { const h = location.hash.slice(1) as Tab; if (TABS.some((t) => t.id === h)) setTab(h); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  useEffect(() => { history.replaceState(null, "", `#${tab}`); window.scrollTo(0, 0); }, [tab]);
  const journal = (d: Draft) => {
    const z = d.setup.zones[d.zone];
    setPrefill({ id: uid(), createdAt: Date.now(), exchange: d.exchange, symbol: d.symbol, tf: d.tf, side: d.setup.dir, entry: +z.entry.toPrecision(8), stop: +z.stop.toPrecision(8), size: 0,
      signals: d.setup.signals.filter((s) => s.pass).map((s) => s.name), confidence: d.setup.confidence, zone: z.rank, settings, checklist: d.checklist, source: "scan" });
    setTab("journal");
  };
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#scan" onClick={() => setTab("scan")}><span className="dot" aria-hidden />Signal</a>
        <nav className="nav" aria-label="Main">{TABS.map((t) => <button key={t.id} className={`${tab === t.id ? "on" : ""} ${t.more ? "is-more" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); setMore(false); }}>{t.id === "watch" ? <>Watch<span className="lg">list</span></> : t.name}</button>)}
          <button className={`more-btn ${TABS.some((t) => t.more && t.id === tab) ? "on" : ""}`} aria-expanded={more} aria-haspopup="menu" onClick={() => setMore(!more)}>More</button>
          {more && <div className="more-menu" role="menu">{TABS.filter((t) => t.more).map((t) => <button key={t.id} role="menuitem" className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); setMore(false); }}>{t.name}</button>)}</div>}
        </nav>
        <button className="btn ghost sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
      </header>
      <main>
        {tab === "scan" && <ScanView settings={settings} theme={theme} onJournal={journal} />}
        {tab === "watch" && <Watchlist settings={settings} onOpen={(ex, sym, tf) => { localStorage.setItem("sig.ex", ex); localStorage.setItem("sig.sym", sym); localStorage.setItem("sig.tf", tf); setTab("scan"); }} />}
        {tab === "market" && <MarketView />}
        {tab === "wallets" && <Wallets />}
        {tab === "journal" && <JournalView prefill={prefill} clearPrefill={() => setPrefill(null)} />}
        {tab === "settings" && <SettingsView settings={settings} setSettings={setSettings} />}
      </main>
      <footer className="foot dim small">Signal v1.6 · Public market data only · no accounts · journal never leaves this device · not financial advice</footer>
    </div>
  );
}
