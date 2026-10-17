// @ts-ignore node builtin in tests
import { createHash } from "node:crypto";
// @ts-ignore node builtin in tests
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { rewriteWelcome } from "../src/welcomeRoute";
import { Welcome } from "../src/ui/Welcome";

const read = (p: string) => readFileSync(p, "utf8");

describe("welcome route", () => {
  it("rewrites only /welcome and leaves the app path alone", () => {
    expect(rewriteWelcome("/")).toBe("/");
    expect(rewriteWelcome("/#today")).toBe("/#today");
    expect(rewriteWelcome("/#scan")).toBe("/#scan");
    expect(rewriteWelcome("/api/paper")).toBe("/api/paper");
    expect(rewriteWelcome("/icons/icon-192.png")).toBe("/icons/icon-192.png");
    expect(rewriteWelcome("/welcome")).toBe("/welcome.html");
    expect(rewriteWelcome("/welcome/")).toBe("/welcome.html");
    expect(rewriteWelcome("/welcome?ref=1")).toBe("/welcome.html?ref=1");
    expect(rewriteWelcome(undefined)).toBeUndefined();
  });

  it("keeps the PWA start URL, the app document, and the hash tabs", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.start_url).toBe("/");
    const vercel = JSON.parse(read("vercel.json"));
    expect(vercel.rewrites).toEqual([{ source: "/welcome", destination: "/welcome.html" }, { source: "/welcome/", destination: "/welcome.html" }]);
    expect(JSON.stringify(vercel.rewrites)).not.toContain("/(.*)");
    const index = read("index.html");
    expect(index).toContain("<title>Signal · entry terminal</title>");
    expect(index).not.toContain("og:title");
    expect(index).toContain('src="/src/main.tsx"');
    const app = read("src/App.tsx");
    expect(app).toContain('history.replaceState(null, "", `#${tab}`)');
    expect(app).toContain('href="#scan"');
    expect(app).toContain('href="/welcome">About</a>');
    expect(app).toContain("Signal v3.6.0");
    expect(app).not.toContain("Switch to");
    expect(JSON.parse(read("package.json")).version).toBe("3.6.0");
    const css = read("src/styles.css");
    expect(css).toMatch(/:root,\.dark\{[^}]*--bg:#edeff2/);
    expect(css.match(/--bg:#edeff2/g)).toHaveLength(1);
    expect(css).not.toContain("#f3f1ec");
    expect(css).not.toContain("#12110e");
    expect(css).not.toContain("#012624");
    expect(css).not.toContain("rgb(250,209,255)");
    expect(css).not.toContain("linear-gradient");
    const script = read("index.html").match(/<script>([^<]*)<\/script>/)?.[1] ?? "";
    expect(script).toBe('try{if(localStorage.getItem("sig.theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}');
    expect(read("vercel.json")).toContain(`sha256-${createHash("sha256").update(script).digest("base64")}`);
  });

  it("serves welcome meta in its own document", () => {
    const html = read("welcome.html");
    expect(html).toContain("<title>Signal · Read the market before you trade it.</title>");
    expect(html).toContain('name="description" content="A free, read-only trading terminal that finds setups across Binance, Hyperliquid and Bulk, then shows you exactly where to look."');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url" content="https://signal-terminal-psi.vercel.app/welcome"');
    expect(html).toContain('src="/src/welcome.tsx"');
    expect(html).not.toContain('src="/src/main.tsx"');
    const inline = (doc: string) => doc.match(/<script>([^<]*)<\/script>/)?.[1];
    expect(inline(html)).toBe(inline(read("index.html")));
    const sw = read("public/sw.js");
    expect(sw).toContain('caches.open(C).then((c) => c.addAll(["/"]))');
    expect(sw).toContain('u.pathname === "/welcome" || u.pathname === "/welcome.html"');
    expect(sw).toContain('caches.match("/")');
  });

  it("renders the approved copy and sends both actions to /", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<Welcome />); });
    const text = el.textContent ?? "";
    for (const line of [
      "Signal",
      "Read the market before you trade it.",
      "A free, read-only trading terminal that finds setups across Binance, Hyperliquid and Bulk, then shows you exactly where to look.",
      "WHAT IT IS",
      "Signal scans the market for you and highlights where price structure and other signals line up. It never places trades. You stay in control.",
      "WHAT IT DOES",
      "Setups that agree:",
      "A setup only shows up when market structure agrees with at least 3 other signals.",
      "Three entry zones:",
      "Every setup comes with 3 zones, each with an entry range, two take profits and a strength label.",
      "Today at a glance:",
      "See the best setups across different coins in one place.",
      "Your rules:",
      "Change any strategy setting to fit how you trade.",
      "Funding rates:",
      "Compare funding across 9 exchanges side by side.",
      "Private journal:",
      "Log your trades, your emotions and whether you stuck to the plan. Everything stays on your device.",
      "Alerts:",
      "Watch the setups you care about and remove them anytime.",
      "HOW CONFIDENCE WORKS",
      "Low, Med or High is a weighted score of how strongly the signals agree. It is not a win chance.",
      "HONEST NOTE",
      "Signal is a free beta. We're testing how the setups perform right now, and we'll share the results as they come in.",
      "Read-only. No trade execution. Not financial advice.",
    ]) expect(text).toContain(line);
    const opens = [...el.querySelectorAll('a[href="/"]')].map((a) => a.textContent);
    expect(opens).toEqual(["Open Signal", "Open Signal", "Open Signal"]);
    expect(el.querySelector('a[href="#what-it-does"]')?.textContent).toBe("How it works");
    expect(el.querySelector(".land-venues")?.textContent).toContain("Binance");
    expect(el.querySelector(".land-venues")?.textContent).toContain("Hyperliquid");
    expect(el.querySelector(".land-venues")?.textContent).toContain("Bulk");
    expect(el.querySelector(".land-stats")).toBeNull();
    expect(el.querySelector("canvas")).toBeNull();
    expect(el.querySelector("img")?.getAttribute("src")).toBe("/welcome/chart-dark.png");
    expect(el.querySelector(".land-hero")).not.toBeNull();
    expect(el.querySelector(".land-widget")).not.toBeNull();
    expect(el.querySelector(".land-theme")).toBeNull();
    expect(el.querySelector('a[href="/welcome"]')).toBeNull();
    await act(async () => { root.unmount(); });
    el.remove();
  });
});
