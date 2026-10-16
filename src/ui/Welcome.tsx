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
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#12110e" : "#f3f1ec");
    try { localStorage.setItem("sig.theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  return (
    <div className="land">
      <header className="land-top">
        <p className="brand"><span className="dot" aria-hidden />Signal</p>
        <button className="btn ghost sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "Light" : "Dark"}</button>
      </header>
      <main>
        <h1>Read the market before you trade it.</h1>
        <p className="land-lead">A free, read-only trading terminal that finds setups across Binance, Hyperliquid and Bulk, then shows you exactly where to look.</p>
        <p className="land-cta"><a className="btn primary" href="/">Open Signal</a></p>
        <section className="land-sec">
          <h2>WHAT IT IS</h2>
          <p>Signal scans the market for you and highlights where price structure and other signals line up. It never places trades. You stay in control.</p>
        </section>
        <section className="land-sec">
          <h2>WHAT IT DOES</h2>
          <ul className="land-list">
            {FEATURES.map((f) => <li key={f.lead}><b>{f.lead}</b> <span>{f.body}</span></li>)}
          </ul>
        </section>
        <section className="land-sec">
          <h2>HOW CONFIDENCE WORKS</h2>
          <p>Low, Med or High tells you how many signals agree. It is not a win chance.</p>
        </section>
        <section className="land-sec">
          <h2>HONEST NOTE</h2>
          <p>Signal is a free beta. We're testing how the setups perform right now, and we'll share the results as they come in.</p>
        </section>
      </main>
      <footer className="land-foot">
        <p>Read-only. No trade execution. Not financial advice.</p>
        <a className="btn primary" href="/">Open Signal</a>
      </footer>
    </div>
  );
}
