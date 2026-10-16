import { useEffect, useState } from "react";

const FEATURES: { lead: string; body: string }[] = [
  { lead: "Setups that agree:", body: "A setup only shows up when market structure agrees with at least 3 other signals." },
  { lead: "Three entry zones:", body: "Every setup comes with 3 zones, each with an entry range, two take profits and a strength label." },
  { lead: "Today at a glance:", body: "See the best setups across different coins in one place." },
  { lead: "Your rules:", body: "Change any strategy setting to fit how you trade." },
  { lead: "Funding rates:", body: "Compare funding across 9 exchanges side by side." },
  { lead: "Private journal:", body: "Log your trades, your emotions and whether you stuck to the plan. Everything stays on your device." },
  { lead: "Alerts:", body: "Watch the setups you care about and remove them anytime." },
];

export function Welcome() {
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.classList.add("land-root");
    return () => document.documentElement.classList.remove("land-root");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111111" : "#f5f5f5");
    try { localStorage.setItem("sig.theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  return (
    <div className="land">
      <header className="land-nav">
        <p className="land-mark">Signal</p>
        <button className="land-theme" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
        <a className="land-pill solid" href="/">Open Signal</a>
      </header>
      <main>
        <section className="land-hero">
          <h1>Read the market before you trade it.</h1>
          <p className="land-sub">A free, read-only trading terminal that finds setups across Binance, Hyperliquid and Bulk, then shows you exactly where to look.</p>
          <div className="land-actions">
            <a className="land-pill solid" href="/">Open Signal</a>
            <a className="land-pill soft" href="#what-it-does">How it works</a>
          </div>
        </section>
        <p className="land-venues"><span>Binance</span><span>Hyperliquid</span><span>Bulk</span></p>
        <figure className="land-frame">
          <img className="is-light" src="/welcome/chart-light.png" alt="Signal chart with entry zones, a stop, and two take profits" />
          <img className="is-dark" src="/welcome/chart-dark.png" alt="" aria-hidden="true" />
        </figure>
        <section className="land-block">
          <h2>WHAT IT IS</h2>
          <p className="land-display">Signal scans the market for you and highlights where price structure and other signals line up. It never places trades. You stay in control.</p>
        </section>
        <section className="land-block" id="what-it-does">
          <h2>WHAT IT DOES</h2>
          <ul className="land-list">
            {FEATURES.map((f) => <li key={f.lead}><p className="land-item">{f.lead}</p><p>{f.body}</p></li>)}
          </ul>
        </section>
        <section className="land-block">
          <h2>HOW CONFIDENCE WORKS</h2>
          <p className="land-display">Low, Med or High tells you how many signals agree. It is not a win chance.</p>
        </section>
        <section className="land-block">
          <h2>HONEST NOTE</h2>
          <p className="land-display">Signal is a free beta. We're testing how the setups perform right now, and we'll share the results as they come in.</p>
        </section>
      </main>
      <footer className="land-close">
        <p>Read-only. No trade execution. Not financial advice.</p>
        <a className="land-pill solid" href="/">Open Signal</a>
      </footer>
    </div>
  );
}
