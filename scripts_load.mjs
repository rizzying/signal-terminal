// Load metrics: requests by host in the first 8s of the Scan tab, duplicate URLs, JS bytes, and (optionally) time-hidden polling.
import { chromium } from "playwright-core";
const base = process.env.URL || "http://localhost:4173"; const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const reqs = []; let js = 0;
p.on("request", (r) => reqs.push(r.method() + " " + r.url() + (r.postData() ? " " + r.postData().slice(0, 80) : "")));
p.on("response", async (r) => { if (r.url().endsWith(".js")) { try { js += (await r.body()).length; } catch {} } });
const t0 = Date.now(); await p.goto(base + "/#scan", { waitUntil: "load" }); const load = Date.now() - t0;
await p.waitForSelector("[data-lines]", { timeout: 20000 }).catch(() => {}); const ready = Date.now() - t0; await p.waitForTimeout(8000);
const ext = reqs.filter((r) => !r.includes(new URL(base).host)); const dup = {}; for (const r of ext) dup[r] = (dup[r] || 0) + 1;
console.log(JSON.stringify({ loadMs: load, chartReadyMs: ready, total: reqs.length, external: ext.length, jsKB: Math.round(js / 1024), dups: Object.entries(dup).filter(([, n]) => n > 1).map(([u, n]) => n + "× " + u.slice(0, 140)) }, null, 1));
await b.close();
