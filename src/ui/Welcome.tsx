import { useEffect } from "react";

const FEATURES: { lead: string; body: string }[] = [
  { lead: "Setups that agree:", body: "A setup only shows up when market structure agrees with at least 3 other signals." },
  { lead: "Three entry zones:", body: "Every setup comes with 3 zones, each with an entry range, two take profits and a strength label." },
  { lead: "Today at a glance:", body: "See the best setups across different coins in one place." },
  { lead: "Your rules:", body: "Change any strategy setting to fit how you trade." },
  { lead: "Funding rates:", body: "Compare funding across 9 exchanges side by side." },
  { lead: "Private journal:", body: "Log your trades, your emotions and whether you stuck to the plan. Everything stays on your device." },
  { lead: "Alerts:", body: "Watch the setups you care about and remove them anytime." },
];
const HONEST = "Signal is a free beta. We're testing how the setups perform right now, and we'll share the results as they come in.";

function LineArt() {
  return (
    <svg className="land-art" viewBox="0 0 480 220" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="8,168 56,150 104,176 152,118 200,136 248,84 296,108 344,52 392,78 472,36" />
    </svg>
  );
}

function Tagline({ text }: { text: string }) {
  const words = text.split(" ");
  return <p className="land-tagline">{words.map((w, i) => <span className="w" key={i}>{w}{i < words.length - 1 ? " " : ""}</span>)}</p>;
}

export function Welcome() {
  useEffect(() => {
    document.documentElement.classList.add("land-root", "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#f6f0e4");
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = [...document.querySelectorAll<HTMLElement>(".reveal")];
    const words = [...document.querySelectorAll<HTMLElement>(".land-tagline .w")];
    if (reduce || typeof IntersectionObserver === "undefined") {
      words.forEach((w) => w.classList.add("on"));
      return () => document.documentElement.classList.remove("land-root", "motion");
    }
    const band = () => window.innerHeight * 0.62;
    const markWords = () => {
      const line = band();
      for (const w of words) if (!w.classList.contains("on") && w.getBoundingClientRect().top < line) w.classList.add("on");
    };
    const vis = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); vis.unobserve(e.target); }
    }, { threshold: 0.2 });
    sections.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) n.classList.add("in");
      vis.observe(n);
    });
    const wordsIO = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("on"); wordsIO.unobserve(e.target); }
    }, { threshold: 0.6, rootMargin: "0px 0px -38% 0px" });
    words.forEach((w) => wordsIO.observe(w));
    document.documentElement.classList.add("motion");
    markWords();
    return () => {
      document.documentElement.classList.remove("land-root", "motion");
      vis.disconnect();
      wordsIO.disconnect();
    };
  }, []);
  return (
    <div className="land">
      <a className="skip" href="#content" onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }}>Skip to content</a>
      <header className="land-nav">
        <p className="land-mark">signal</p>
        <nav className="land-links" aria-label="On this page">
          <a href="#what-it-is">What it is</a>
          <a href="#confidence">How confidence works</a>
        </nav>
        <div className="land-nav-cta">
          <a className="land-ghost" href="#what-it-does">How it works</a>
          <a className="land-cta" href="/">Open Signal</a>
        </div>
      </header>
      <main id="content" tabIndex={-1}>
        <section className="land-hero reveal">
          <div>
            <h1>Read the market <br />before you trade it.</h1>
            <p className="land-sub">A free, read-only trading terminal that finds setups across Binance, Hyperliquid and Bulk, then shows you exactly where to look.</p>
            <div className="land-actions">
              <a className="land-cta" href="/">Open Signal</a>
              <a className="land-ghost" href="#what-it-does">How it works</a>
            </div>
          </div>
          <aside className="land-widget" aria-label="Signal chart">
            <div className="land-widget-bar"><span>Chart</span><span>BTC</span></div>
            <img src="/welcome/chart-dark.png" alt="Signal chart with entry zones, a stop, and two take profits" />
          </aside>
        </section>
        <p className="land-venues reveal"><span>Binance</span><span>Hyperliquid</span><span>Bulk</span></p>
        <section className="land-dark reveal">
          <div className="land-split" id="what-it-is">
            <div>
              <h2>WHAT IT IS</h2>
              <p>Signal scans the market for you and highlights where price structure and other signals line up. It never places trades. You stay in control.</p>
            </div>
            <LineArt />
          </div>
          <div className="land-split flip" id="confidence">
            <div>
              <h2>HOW CONFIDENCE WORKS</h2>
              <p>Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance.</p>
            </div>
            <LineArt />
          </div>
        </section>
        <section className="land-light reveal" id="what-it-does">
          <h2>WHAT IT DOES</h2>
          <ul className="land-grid">
            {FEATURES.map((f) => <li key={f.lead}><p className="land-item">{f.lead}</p><p>{f.body}</p></li>)}
          </ul>
        </section>
        <section className="land-close reveal">
          <div className="land-close-in">
            <h2>HONEST NOTE</h2>
            <Tagline text={HONEST} />
            <a className="land-cta on-dark" href="/">Open Signal</a>
          </div>
        </section>
      </main>
      <footer className="land-foot">
        <p>Read-only. No trade execution. Not financial advice.</p>
      </footer>
    </div>
  );
}
