import { useEffect, useState } from "react";
import { DEFAULTS, sanitize, type Settings } from "./engine/settings";
import { db, uid, type Trade } from "./journal/db";
import { JournalView } from "./ui/Journal";
import { ScanView, type Draft } from "./ui/Scan";
import { SettingsView } from "./ui/SettingsView";

type Tab = "scan" | "journal" | "settings";
const TABS: { id: Tab; name: string }[] = [{ id: "scan", name: "Scan" }, { id: "journal", name: "Journal" }, { id: "settings", name: "Settings" }];
export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || "scan");
  const [theme, setTheme] = useState(() => localStorage.getItem("sig.theme") || "dark");
  const [settings, setSettingsS] = useState<Settings>(DEFAULTS); const [prefill, setPrefill] = useState<Trade | null>(null);
  useEffect(() => { db.get<Settings>("settings").then((s) => { if (!s) return; if ((s as any).gateStructure === undefined) s = { ...s, threshold: 0, useHtf: false }; setSettingsS(sanitize(s)); }); }, []);
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
        <nav className="nav" aria-label="Main">{TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{t.name}</button>)}</nav>
        <button className="btn ghost sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
      </header>
      <main>
        {tab === "scan" && <ScanView settings={settings} theme={theme} onJournal={journal} />}
        {tab === "journal" && <JournalView prefill={prefill} clearPrefill={() => setPrefill(null)} />}
        {tab === "settings" && <SettingsView settings={settings} setSettings={setSettings} />}
      </main>
      <footer className="foot dim small">Signal v1.1 · Public market data only · no accounts · journal never leaves this device · not financial advice</footer>
    </div>
  );
}
