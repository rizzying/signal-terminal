import { chromium } from "playwright-core";
import fs from "node:fs";
const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const base = process.env.URL || "http://localhost:4173";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const sizes = [320, 390, 768, 1024, 1440]; const report = [];
for (const theme of ["dark", "light"]) for (const w of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem("sig.theme", t), theme);
  const p = await ctx.newPage(); const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  for (const tab of ["scan", "watch", "journal", "settings"]) {
    await p.goto(`${base}/#${tab}`); await p.waitForTimeout(tab === "scan" ? 3500 : 800);
    if (tab === "scan") { await p.getByRole("button", { name: "Scan long" }).click(); await p.waitForTimeout(2500); }
    if (tab === "scan") { const fp = p.locator(".funding"); await p.waitForFunction(() => document.querySelector(".funding table, .funding p"), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500); await fp.screenshot({ path: `docs/qa/funding-${w}-${theme}.png` }); await p.waitForTimeout(1500); await p.locator(".positioning").screenshot({ path: `docs/qa/positioning-${w}-${theme}.png` }); }
    if (tab === "scan") { await p.getByRole("button", { name: "Run replay" }).click(); await p.waitForTimeout(1500); await p.locator(".history").screenshot({ path: `docs/qa/history-${w}-${theme}.png` }); }
    if (tab === "watch") { await p.getByRole("button", { name: "Scan watchlist" }).click(); await p.waitForSelector(".rt tbody tr", { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(500); }
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
