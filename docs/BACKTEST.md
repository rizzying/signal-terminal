# Backtest study (v2.1, run 2026-10-13)

**Bottom line: no setting has a reliable edge.** Every configuration that looked best in-sample lost money out-of-sample, and the configurations that did best out-of-sample had lost in-sample, which points to regime luck rather than an edge. Only 23% of the 480 configurations had positive pooled out-of-sample expectancy, and those positive results had small samples (about 90–130 trades). Signal's zones are best used as a **level map** (where to look, where you're wrong, where to take profit), not as a mechanical system. Past results, not a promise.

## Method
- **Data:** Hyperliquid candles (the most recent ≤5000 per interval) for BTC, ETH and SOL on 1h, 4H and 1D, giving 9 datasets. Approximate spans: 1h is 2026-03-31 → 2026-10-13, 4H is 2024-08-21 → 2026-10-13 and 1D is 2021-06 → 2026-10-12, each after a 300-candle indicator warm-up.
- **Split:** the first 60% of each dataset is in-sample (IS) and the last 40% is out-of-sample (OOS). Selection used IS only; OOS is reported afterwards. Splits are 2026-07-27 for 1h, 2025-12-04 for 4H and about 2024-08-25 for 1D.
- **Signals:** computed walk-forward at each candle close using only closed candles (300-bar window). The best-confidence long or short setup that passes the strategy's gate becomes a pending order (valid for 12 candles and refreshed each candle). One position at a time.
- **Grid:** 4 built-in strategies × zones 1/2/3 × stop k ∈ {0.5, 1, 1.5, 2}×ATR beyond the zone × exit ∈ {TP 1.5R, 2R, 3R; half at 2R and rest at 3R; half at 2R and rest at break-even} × entry ∈ {candle closes inside the zone, first touch}. That's **480 configurations × 9 datasets**.
- **Costs:** Hyperliquid taker fee 0.045% each side plus 1bp spread, charged in R on every trade. When a stop and a target fall inside the same candle, the stop is assumed.
- **Ranking:** robust score = median per-dataset expectancy × share of datasets that are positive. A config needs at least 60 pooled trades and at least 5 trades in at least 6 of the 9 datasets.

## Top 12 by in-sample robust score, with their out-of-sample results
| Strategy | Zone | Stop k×ATR | Exit | Entry | IS trades | IS exp (R) | IS datasets + | OOS trades | OOS exp (R) | OOS median | OOS datasets + | OOS win % | OOS max DD (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Structure + FVG/OB | 1 | 1.5 | TP 3R | close in zone | 452 | +0.08 | 7/9 | 252 | -0.10 | -0.03 | 3/9 | 24 | 21.6 |
| Structure + FVG/OB | 1 | 1.5 | ½@2R, rest 3R | close in zone | 452 | +0.07 | 7/9 | 252 | -0.09 | -0.08 | 3/9 | 33 | 20.1 |
| Breakout with volume | 1 | 1.5 | ½@2R, rest 3R | close in zone | 437 | +0.05 | 6/9 | 267 | -0.16 | -0.10 | 4/9 | 30 | 22.4 |
| Signal default | 1 | 2 | TP 2R | close in zone | 397 | +0.04 | 6/9 | 249 | -0.12 | -0.11 | 4/9 | 31 | 22.6 |
| Breakout with volume | 1 | 2 | TP 2R | close in zone | 396 | +0.04 | 6/9 | 251 | -0.13 | -0.08 | 4/9 | 31 | 22.6 |
| Structure + FVG/OB | 1 | 2 | TP 2R | close in zone | 397 | +0.07 | 6/9 | 237 | -0.11 | -0.14 | 3/9 | 32 | 25.6 |
| Breakout with volume | 1 | 1.5 | TP 3R | touch | 692 | +0.02 | 6/9 | 427 | -0.17 | -0.13 | 3/9 | 23 | 34.7 |
| Signal default | 1 | 1.5 | TP 3R | close in zone | 442 | +0.05 | 5/9 | 266 | -0.15 | -0.11 | 3/9 | 23 | 23.4 |
| Structure + FVG/OB | 1 | 1.5 | ½@2R, rest BE | touch | 764 | +0.01 | 5/9 | 516 | -0.15 | -0.06 | 2/9 | 30 | 40.1 |
| Breakout with volume | 1 | 1.5 | ½@2R, rest 3R | touch | 692 | +0.01 | 5/9 | 427 | -0.17 | -0.12 | 1/9 | 30 | 35.2 |
| Double EMA 21/50 + RSI | 2 | 2 | TP 3R | close in zone | 124 | -0.00 | 5/9 | 87 | -0.22 | -0.36 | 2/7 | 21 | 10.9 |
| Breakout with volume | 1 | 1 | TP 3R | touch | 1149 | +0.03 | 5/9 | 781 | -0.18 | -0.15 | 1/9 | 23 | 44.1 |

All 12 are negative out-of-sample.

## Top 8 by out-of-sample score (hindsight only; not used for selection)
| Strategy | Zone | Stop k×ATR | Exit | Entry | IS trades | IS exp (R) | IS datasets + | OOS trades | OOS exp (R) | OOS median | OOS datasets + | OOS win % | OOS max DD (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Breakout with volume | 2 | 1.5 | TP 2R | close in zone | 131 | -0.20 | 2/9 | 97 | +0.08 | +0.39 | 4/8 | 38 | 8.1 |
| Double EMA 21/50 + RSI | 2 | 0.5 | TP 2R | touch | 311 | -0.24 | 2/9 | 265 | -0.01 | +0.33 | 5/9 | 40 | 24.1 |
| Signal default | 2 | 1.5 | TP 2R | close in zone | 137 | -0.22 | 2/9 | 92 | +0.18 | +0.31 | 4/7 | 41 | 7.0 |
| Structure + FVG/OB | 2 | 1.5 | TP 1.5R | close in zone | 131 | -0.15 | 2/9 | 96 | +0.17 | +0.29 | 4/7 | 49 | 7.5 |
| Structure + FVG/OB | 2 | 2 | TP 2R | close in zone | 111 | -0.21 | 3/9 | 86 | +0.18 | +0.21 | 5/7 | 41 | 6.8 |
| Double EMA 21/50 + RSI | 2 | 1.5 | TP 1.5R | close in zone | 154 | -0.17 | 2/9 | 125 | +0.07 | +0.20 | 5/7 | 46 | 7.5 |
| Signal default | 2 | 1 | TP 3R | close in zone | 141 | -0.25 | 4/9 | 95 | +0.06 | +0.26 | 4/8 | 28 | 9.6 |
| Structure + FVG/OB | 2 | 1.5 | TP 2R | close in zone | 127 | -0.18 | 2/9 | 92 | +0.15 | +0.22 | 4/7 | 40 | 7.0 |

Almost all of these lost in-sample, so they're not robust.

## Averages over the grid (mean expectancy in R per trade)
| Factor | IS / OOS |
|---|---|
| entry | close in zone: IS -0.20 / OOS -0.31 · touch: IS -0.13 / OOS -0.14 |
| exit | TP 1.5R: IS -0.17 / OOS -0.22 · TP 2R: IS -0.17 / OOS -0.21 · TP 3R: IS -0.16 / OOS -0.26 · ½@2R, rest 3R: IS -0.16 / OOS -0.23 · ½@2R, rest BE: IS -0.15 / OOS -0.22 |
| k | 1: IS -0.19 / OOS -0.23 · 2: IS -0.12 / OOS -0.17 · 0.5: IS -0.21 / OOS -0.34 · 1.5: IS -0.13 / OOS -0.16 |
| zone | 1: IS -0.03 / OOS -0.14 · 2: IS -0.23 / OOS -0.00 · 3: IS -0.23 / OOS -0.54 |
| strat | Signal default: IS -0.14 / OOS -0.30 · Double EMA 21/50 + RSI: IS -0.12 / OOS -0.08 · Breakout with volume: IS -0.20 / OOS -0.26 · Structure + FVG/OB: IS -0.19 / OOS -0.26 |

## Shipped defaults (for all built-ins): stop 1.5×ATR beyond the zone, TP1 at 2R, enter after a candle closes inside the zone
These defaults were chosen because they were the least fragile, not because they're profitable:
- A **1.5×ATR** stop had the best OOS average of the four buffers, and 1.5–2 dominated the IS leaders.
- **TP1 at 2R** ties for the best OOS average with 1.5R. 1:3 was worse both IS and OOS, so it's no longer the default but remains an option (Settings → TP1 at R:R, and Backtest → Exit).
- **Close-in-zone entry** removes same-candle stop-outs. Touch entry averaged better OOS (it trades more often at shallower prices), but it was worse among the IS leaders. Both are selectable.
- **Zone 2** stays the default. Zone 3 rarely fills (fewer than 10 trades), and zone 1 trades most but drifts negative.

| Strategy | Zone | Stop k×ATR | Exit | Entry | IS trades | IS exp (R) | IS datasets + | OOS trades | OOS exp (R) | OOS median | OOS datasets + | OOS win % | OOS max DD (R) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Signal default | 1 | 1.5 | TP 2R | close in zone | 597 | +0.00 | 4/9 | 368 | -0.06 | +0.02 | 5/9 | 33 | 24.1 |
| Signal default | 2 | 1.5 | TP 2R | close in zone | 137 | -0.22 | 2/9 | 92 | +0.18 | +0.31 | 4/7 | 41 | 7.0 |
| Signal default | 3 | 1.5 | TP 2R | close in zone | 9 | -0.05 | 0/0 | 3 | -1.10 | +0.00 | 0/0 | 0 | 2.3 |
| Double EMA 21/50 + RSI | 1 | 1.5 | TP 2R | close in zone | 529 | -0.03 | 4/9 | 334 | -0.12 | -0.07 | 2/9 | 31 | 16.2 |
| Double EMA 21/50 + RSI | 2 | 1.5 | TP 2R | close in zone | 146 | -0.14 | 3/9 | 116 | +0.02 | -0.01 | 3/7 | 36 | 10.6 |
| Double EMA 21/50 + RSI | 3 | 1.5 | TP 2R | close in zone | 9 | -0.38 | 0/0 | 5 | +0.14 | +0.00 | 0/0 | 40 | 1.1 |
| Breakout with volume | 1 | 1.5 | TP 2R | close in zone | 594 | +0.00 | 4/9 | 363 | -0.08 | +0.00 | 5/9 | 33 | 24.1 |
| Breakout with volume | 2 | 1.5 | TP 2R | close in zone | 131 | -0.20 | 2/9 | 97 | +0.08 | +0.39 | 4/8 | 38 | 8.1 |
| Breakout with volume | 3 | 1.5 | TP 2R | close in zone | 8 | -0.67 | 0/0 | 4 | -1.08 | +0.00 | 0/0 | 0 | 2.3 |
| Structure + FVG/OB | 1 | 1.5 | TP 2R | close in zone | 604 | +0.02 | 5/9 | 362 | -0.07 | -0.02 | 4/9 | 33 | 27.1 |
| Structure + FVG/OB | 2 | 1.5 | TP 2R | close in zone | 127 | -0.18 | 2/9 | 92 | +0.15 | +0.22 | 4/7 | 40 | 7.0 |
| Structure + FVG/OB | 3 | 1.5 | TP 2R | close in zone | 7 | -0.21 | 0/0 | 2 | -1.13 | +0.00 | 0/0 | 0 | 2.3 |

### Zone 2 per dataset, out-of-sample expectancy (R)
| Strategy | BTC-1h | BTC-4H | BTC-1D | ETH-1h | ETH-4H | ETH-1D | SOL-1h | SOL-4H | SOL-1D |
|---|---|---|---|---|---|---|---|---|---|
| Signal default | +0.70 (10) | +0.31 (11) | – (4) | -0.04 (17) | +0.46 (12) | – (4) | -0.58 (12) | +0.47 (16) | -0.51 (6) |
| Double EMA 21/50 + RSI | +0.24 (18) | +0.36 (17) | – (4) | -0.19 (26) | +1.10 (7) | – (3) | -0.49 (20) | -0.23 (15) | -0.01 (6) |
| Breakout with volume | +0.39 (12) | +0.45 (10) | -0.16 (7) | -0.35 (16) | +0.60 (11) | – (4) | -0.48 (15) | +0.47 (16) | -1.01 (6) |
| Structure + FVG/OB | +0.81 (11) | +0.56 (13) | – (4) | -0.16 (16) | +0.22 (12) | – (3) | -0.58 (12) | +0.28 (16) | -0.41 (5) |

Zone 2 OOS looks positive (+0.02 to +0.18R), but the same rules were **negative in-sample** (−0.15 to −0.22R), on about 90–120 trades. Treat that as noise.

## Caveats
- Only one IS/OOS split. HL's 5000-candle cap limits 1h to about 6.5 months.
- Funding isn't charged; the liquidation-heatmap stop nudge and the higher-timeframe note are off in the study.
- Fills are simulated on candles with no queue position or latency.

Reproduce with `npx esbuild study/run.ts study/signals.ts --bundle --platform=node --format=esm --outdir=study --out-extension:.js=.mjs && node study/run.mjs && node study/report.mjs`.
