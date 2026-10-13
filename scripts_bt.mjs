import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const w of [390, 1280]) {
const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto((process.env.URL || "http://localhost:4173") + "/#backtest"); await p.waitForTimeout(2500);
await p.click("text=Run backtest"); const t0 = Date.now();
await p.waitForSelector(".stats", { timeout: 120000 });
console.log(w, "ms", Date.now() - t0, (await p.locator(".stats").innerText()).replace(/\n/g, " | "));
await p.click("text=Dates"); await p.fill('input[aria-label="Start date"]', "2020-01-01"); console.log("block:", await p.locator('[role=alert]').first().innerText().catch(() => "none"));
await p.screenshot({ path: `docs/qa/backtest-${w}.png`, fullPage: true }); console.log("errors", errs.slice(0, 3));
}
await b.close();
