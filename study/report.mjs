import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("/workspace/bt-cache/grid.json"));
const f = (x) => (x >= 0 ? "+" : "") + x.toFixed(2); const ok = (r, k) => r[k].n >= 60 && r[k].cnt >= 6; const score = (r, k) => r[k].med * (r[k].pos / Math.max(1, r[k].cnt));
const hdr = "| Strategy | Zone | Stop k×ATR | Exit | Entry | IS trades | IS exp (R) | IS datasets + | OOS trades | OOS exp (R) | OOS median | OOS datasets + | OOS win % | OOS max DD (R) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
const row = (r) => `| ${r.strat} | ${r.zone} | ${r.k} | ${r.exit} | ${r.entry} | ${r.is.n} | ${f(r.is.exp)} | ${r.is.pos}/${r.is.cnt} | ${r.oos.n} | ${f(r.oos.exp)} | ${f(r.oos.med)} | ${r.oos.pos}/${r.oos.cnt} | ${r.oos.win.toFixed(0)} | ${r.oos.maxDD.toFixed(1)} |`;
const isRank = rows.filter((r) => ok(r, "is")).sort((a, b) => score(b, "is") - score(a, "is"));
const mean = (key) => { const m = {}; for (const r of rows) (m[r[key]] ??= []).push(r); return "| " + key + " | " + Object.entries(m).map(([k, v]) => `${k}: IS ${f(v.reduce((a, b) => a + b.is.exp, 0) / v.length)} / OOS ${f(v.reduce((a, b) => a + b.oos.exp, 0) / v.length)}`).join(" · ") + " |"; };
const pick = rows.filter((r) => r.k === 1.5 && r.exit === "TP 2R" && r.entry === "close in zone");
const ds = ["BTC-1h", "BTC-4H", "BTC-1D", "ETH-1h", "ETH-4H", "ETH-1D", "SOL-1h", "SOL-4H", "SOL-1D"];
const z2 = pick.filter((r) => r.zone === 2);
const out = `# Backtest study (v2.1, run ${new Date().toISOString().slice(0, 10)})

**Bottom line: no setting has a reliable edge.** Every configuration that looked best in-sample lost money out-of-sample, and the configurations that did best out-of-sample had lost in-sample, which points to regime luck rather than an edge. Only ${(rows.filter((r) => r.oos.exp > 0).length / rows.length * 100).toFixed(0)}% of the ${rows.length} configurations had positive pooled out-of-sample expectancy, and those positive results had small samples (about 90–130 trades). Signal's zones are best used as a **level map** (where to look, where you're wrong, where to take profit), not as a mechanical system. Past results, not a promise.

## Method
- **Data:** Hyperliquid candles (the most recent ≤5000 per interval) for BTC, ETH and SOL on 1h, 4H and 1D, giving 9 datasets. Approximate spans: 1h is 2026-03-31 → 2026-10-13, 4H is 2024-08-21 → 2026-10-13 and 1D is 2021-06 → 2026-10-12, each after a 300-candle indicator warm-up.
- **Split:** the first 60% of each dataset is in-sample (IS) and the last 40% is out-of-sample (OOS). Selection used IS only; OOS is reported afterwards. Splits are 2026-07-27 for 1h, 2025-12-04 for 4H and about 2024-08-25 for 1D.
- **Signals:** computed walk-forward at each candle close using only closed candles (300-bar window). The best-confidence long or short setup that passes the strategy's gate becomes a pending order (valid for 12 candles and refreshed each candle). One position at a time.
- **Grid:** 4 built-in strategies × zones 1/2/3 × stop k ∈ {0.5, 1, 1.5, 2}×ATR beyond the zone × exit ∈ {TP 1.5R, 2R, 3R; half at 2R and rest at 3R; half at 2R and rest at break-even} × entry ∈ {candle closes inside the zone, first touch}. That's **${rows.length} configurations × 9 datasets**.
- **Costs:** Hyperliquid taker fee 0.045% each side plus 1bp spread, charged in R on every trade. When a stop and a target fall inside the same candle, the stop is assumed.
- **Ranking:** robust score = median per-dataset expectancy × share of datasets that are positive. A config needs at least 60 pooled trades and at least 5 trades in at least 6 of the 9 datasets.

## Top 12 by in-sample robust score, with their out-of-sample results
${hdr}
${isRank.slice(0, 12).map(row).join("\n")}

All 12 are negative out-of-sample.

## Top 8 by out-of-sample score (hindsight only; not used for selection)
${hdr}
${rows.filter((r) => ok(r, "oos")).sort((a, b) => score(b, "oos") - score(a, "oos")).slice(0, 8).map(row).join("\n")}

Almost all of these lost in-sample, so they're not robust.

## Averages over the grid (mean expectancy in R per trade)
| Factor | IS / OOS |
|---|---|
${["entry", "exit", "k", "zone", "strat"].map(mean).join("\n")}

## Shipped defaults (for all built-ins): stop 1.5×ATR beyond the zone, TP1 at 2R, enter after a candle closes inside the zone
These defaults were chosen because they were the least fragile, not because they're profitable:
- A **1.5×ATR** stop had the best OOS average of the four buffers, and 1.5–2 dominated the IS leaders.
- **TP1 at 2R** ties for the best OOS average with 1.5R. 1:3 was worse both IS and OOS, so it's no longer the default but remains an option (Settings → TP1 at R:R, and Backtest → Exit).
- **Close-in-zone entry** removes same-candle stop-outs. Touch entry averaged better OOS (it trades more often at shallower prices), but it was worse among the IS leaders. Both are selectable.
- **Zone 2** stays the default. Zone 3 rarely fills (fewer than 10 trades), and zone 1 trades most but drifts negative.

${hdr}
${pick.map(row).join("\n")}

### Zone 2 per dataset, out-of-sample expectancy (R)
| Strategy | ${ds.join(" | ")} |
|---|${ds.map(() => "---").join("|")}|
${z2.map((r) => `| ${r.strat} | ${r.oos.each.map((e) => e.n >= 5 ? `${f(e.exp)} (${e.n})` : `– (${e.n})`).join(" | ")} |`).join("\n")}

Zone 2 OOS looks positive (+0.02 to +0.18R), but the same rules were **negative in-sample** (−0.15 to −0.22R), on about 90–120 trades. Treat that as noise.

## Caveats
- Only one IS/OOS split. HL's 5000-candle cap limits 1h to about 6.5 months.
- Funding isn't charged; the liquidation-heatmap stop nudge and the higher-timeframe note are off in the study.
- Fills are simulated on candles with no queue position or latency.

Reproduce with \`npx esbuild study/run.ts study/signals.ts --bundle --platform=node --format=esm --outdir=study --out-extension:.js=.mjs && node study/run.mjs && node study/report.mjs\`.
`;
fs.writeFileSync("docs/BACKTEST.md", out); console.log(out.length);
