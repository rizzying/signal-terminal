import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" }); const p = await ctx.newPage(); let frames = 0, wsUrl = "", lastPx = 0;
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 150)));
p.on("websocket", (ws) => { wsUrl += ws.url() + " "; ws.on("framereceived", (f) => { if (String(f.payload).includes('"ticker"')) { frames++; try { lastPx = JSON.parse(f.payload).data.ticker.lastPrice; } catch {} } }); });
await p.goto("https://signal-terminal-psi.vercel.app/"); await p.evaluate(() => { localStorage.setItem("sig.ex", "bulk"); localStorage.setItem("sig.sym", "BTC-USD"); localStorage.setItem("sig.tf", "1m"); });
await p.goto("https://signal-terminal-psi.vercel.app/#scan"); await p.reload(); await p.waitForTimeout(8000);
console.log(await p.locator("footer").innerText(), await p.evaluate(() => document.hidden));
for (let i = 0; i < 4; i++) { const head = await p.locator(".chartcard .cardhead").innerText(); console.log(new Date().toISOString().slice(11, 19), "ui:", head.replace(/\s+/g, " ").slice(-30), "| ws ticker", lastPx, "frames", frames); await p.waitForTimeout(3000); }
console.log("sockets:", wsUrl); await p.screenshot({ path: "docs/qa/v277-bulk-live-1440.png" }); await b.close();
