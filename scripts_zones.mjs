// Zone card layout regression: every label's value sits on the same row, nothing overflows. URL=… node scripts_zones.mjs
import { chromium } from "playwright-core";
const U = process.env.URL || "http://localhost:4199/"; const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" }); let bad = 0;
for (const theme of ["dark", "light"]) for (const w of [320, 390, 768, 1024, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } }); await p.goto(U);
  await p.evaluate((t) => { localStorage.setItem("sig.theme", t); localStorage.setItem("sig.ex", "hyperliquid"); localStorage.setItem("sig.sym", "BTC"); localStorage.setItem("sig.tf", "4h"); }, theme);
  await p.goto(U + "#scan"); await p.reload(); await p.waitForTimeout(4000); await p.getByRole("button", { name: "Scan short" }).click(); await p.waitForSelector(".zkv"); await p.waitForTimeout(500);
  const r = await p.$$eval(".zkv", (ls) => ls.map((dl) => { const rows = [...dl.querySelectorAll(".zr")]; return { cols: new Set(rows.map((x) => Math.round(x.closest("button,.card,div")?.getBoundingClientRect().left ?? 0))).size,
    labels: rows.map((x) => x.querySelector("dt").textContent), bad: rows.filter((x) => { const a = x.querySelector("dt").getBoundingClientRect(), d = x.querySelector("dd").getBoundingClientRect(); return Math.abs(a.top + a.height / 2 - (d.top + d.height / 2)) > 4 || d.right > x.getBoundingClientRect().right + 1 || d.left < a.right || d.scrollWidth > d.clientWidth + 1; }).map((x) => x.querySelector("dt").textContent) }; }));
  const left = await p.$$eval(".zkv", (ls) => new Set(ls.map((l) => Math.round(l.getBoundingClientRect().left))).size);
  const fails = r.flatMap((x) => x.bad); bad += fails.length; console.log(theme, w, `${left === 1 ? "stacked" : left + "-col"}`, r.length, "cards", fails.length ? "FAIL " + fails : "ok", r[0]?.labels.join("|"));
  if (w === 1440 || w === 320) await p.screenshot({ path: `/tmp/zones-${theme}-${w}.png`, fullPage: true }); await p.close();
}
await b.close(); process.exit(bad ? 1 : 0);
