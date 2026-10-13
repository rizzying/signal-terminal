// Backtest smoke: BTC 4H 3 months default, magnifier off vs on, unseen-data split + Monte Carlo.
import { chromium } from "playwright-core";
const base = process.env.URL || "http://localhost:4173";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const w of [390, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); const errs = []; p.on("console", (m) => m.type() === "error" && errs.push(m.text())); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "/#backtest"); await p.waitForTimeout(2500);
  const setBox = async (label, on) => { const c = p.locator("label.check input").nth(label.startsWith("Check") ? 0 : 1); if ((await c.isChecked()) !== on) await c.click(); };
  await setBox("Check on unseen data", true);
  for (const mag of w === 1280 ? [false, true] : [true]) {
    await setBox("Bar magnifier", mag); const t0 = Date.now();
    await p.click("button.btn.primary"); await p.waitForFunction(() => document.querySelector("button.btn.primary")?.textContent === "Run backtest", null, { timeout: 180000 });
    console.log(w, mag ? "MAG ON " : "MAG OFF", Date.now() - t0, "ms |", (await p.locator(".stats").first().innerText()).replace(/\n/g, " "));
    console.log("   ", await p.locator("[data-mag]").innerText());
    console.log("   split:", (await p.locator("[data-split]").innerText().catch(() => "none")).replace(/\n/g, " ").slice(0, 260));
    console.log("   mc:", (await p.locator("[data-mc] p.small").first().innerText().catch(() => "none")).slice(0, 400));
  }
  await p.screenshot({ path: `docs/qa/backtest-${w}.png`, fullPage: true }); console.log("errors", errs.slice(0, 3));
}
await b.close();
