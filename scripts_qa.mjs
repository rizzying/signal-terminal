import { chromium } from "playwright-core";
import fs from "node:fs";
const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const base = process.env.URL || "http://localhost:4173";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const sizes = [320, 390, 768, 1024, 1440]; const report = [];
for (const theme of ["dark", "light"]) for (const w of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => { localStorage.setItem("sig.theme", t); localStorage.setItem("sig.wallets", JSON.stringify([{ ex: "hyperliquid", address: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303", name: "HLP vault" }])); localStorage.setItem("sig.labs", JSON.stringify({ backtest: true })); }, theme);
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  for (const tab of ["scan", "market", "watch", "backtest", "calendar", "wallets", "journal", "settings"]) {
    await p.goto(`${base}/#${tab}`); await p.waitForTimeout(tab === "scan" ? 3500 : 800);
    if (tab === "scan") { await p.getByRole("button", { name: "Scan long" }).click(); await p.waitForTimeout(2500); }
    if (tab === "market") { await p.waitForFunction(() => document.querySelector(".funding table"), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(2500); await p.locator(".funding").screenshot({ path: `docs/qa/funding-${w}-${theme}.png` }); await p.locator(".positioning").screenshot({ path: `docs/qa/positioning-${w}-${theme}.png` }); }
    if (w === 320 && tab === "settings") { await p.getByRole("button", { name: "More" }).click(); await p.waitForTimeout(300); await p.screenshot({ path: `docs/qa/nav-more-320-${theme}.png` }); await p.keyboard.press("Escape"); }
    if (tab === "scan" && (w === 390 || w === 1440)) { await p.getByRole("tab", { name: "Bulk" }).click(); await p.waitForSelector(".cmp tbody tr:nth-child(2)", { timeout: 20000 }).catch(() => errs.push("QA: compare row 2 missing")); await p.waitForTimeout(800); await p.locator(".result").screenshot({ path: `docs/qa/zones-costs-${w}-${theme}.png` }); await p.locator(".cmp").screenshot({ path: `docs/qa/compare-${w}-${theme}.png` }); await p.getByRole("tab", { name: "Hyperliquid" }).click(); await p.waitForTimeout(2500); }
    if (tab === "watch") { await p.getByRole("button", { name: "Scan watchlist" }).click(); await p.waitForSelector(".rt tbody tr", { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(500); }
    if (tab === "wallets") await p.waitForTimeout(3000);
    if (tab === "journal") { await p.evaluate(() => new Promise((res) => { const r = indexedDB.open("signal", 1); r.onsuccess = () => { const tx = r.result.transaction("trades", "readwrite"); const st = tx.objectStore("trades"); const pn = [120, -60, 80, -150, 200, 45, -30, 90];
      pn.forEach((v, i) => st.put({ id: "qa" + i, createdAt: Date.now() - (8 - i) * 86400000 - i * 3600000 * 5, exchange: "hyperliquid", symbol: "BTC", side: i % 2 ? "short" : "long", entry: 80000, exit: 80000 + v, stop: 79500, size: 1, pnl: v, r: v / 500, signals: ["Market structure (BoS / ChoCH)"], confidence: 40 + i * 6, zone: (i % 3) + 1, emotion: ["calm", "fomo"][i % 2], followedPlan: i % 3 !== 0, source: "scan" })); tx.oncomplete = res; }; })); await p.reload(); await p.waitForTimeout(1000); }
    if (tab === "journal" && w === 390) { await p.getByRole("button", { name: "New trade" }).click(); await p.waitForTimeout(300); }
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.waitForTimeout(400); await p.addScriptTag({ content: axe });
    const ax = await p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0,2).map(n=>n.target.join(" ")).join(" | ")}`));
    await p.screenshot({ path: `docs/qa/${tab}-${w}-${theme}.png`, fullPage: true });
    report.push({ theme, w, tab, overflow, axe: ax, errs: [...errs] }); errs.length = 0;
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync("docs/qa/report.json", JSON.stringify(report, null, 1));
for (const r of report) if (r.overflow > 0 || r.axe.length || r.errs.length) console.log(JSON.stringify(r));
console.log("done", report.length);
