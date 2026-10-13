// Labs gate check: Backtest hidden + #backtest redirects when off; tab + badge when on.
import { chromium } from "playwright-core";
const base = process.env.URL || "http://localhost:4173"; const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" }); const out = {};
for (const w of [390, 1280]) { const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "/#backtest"); await p.waitForTimeout(2000);
  const navText = async () => { if (w < 768) { await p.click(".more-btn"); const t = await p.locator(".more-menu").innerText(); await p.click(".more-btn"); return t; } return p.locator("nav.nav").innerText(); };
  const off = { hash: await p.evaluate(() => location.hash), nav: (await navText()).replace(/\n/g, " "), tested: await p.locator("[data-tested]").first().innerText().catch(() => "none") };
  await p.goto(base + "/#settings"); await p.waitForTimeout(1200); await p.getByLabel("Backtest (experimental)").check(); await p.waitForTimeout(300);
  const on = { nav: (await navText()).replace(/\n/g, " ") }; await p.goto(base + "/#backtest"); await p.waitForTimeout(1500); on.hash = await p.evaluate(() => location.hash); on.h2 = await p.locator("h2").first().innerText();
  await p.goto(base + "/#scan"); await p.waitForTimeout(2500); on.tested = (await p.locator("[data-tested]").first().innerText().catch(() => "none")).slice(0, 60);
  await p.reload(); await p.waitForTimeout(1500); on.persisted = await p.evaluate(() => localStorage.getItem("sig.labs")); out[w] = { off, on, errs }; await ctx.close(); }
console.log(JSON.stringify(out, null, 1)); await b.close();
