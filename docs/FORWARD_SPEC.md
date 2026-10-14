# Forward test spec: Binance 1H Zone 2 (frozen)

| | |
|---|---|
| Strategy id | `bn-1h-z2-v1` |
| Rules hash | `b81ceeeb` (FNV-1a of `SPEC` in `src/forward/trader.ts`, checked by `tests/paper.test.ts`) |
| Frozen | 14 Oct 2026 (v3.0.0). The first hourly run after deploy is the start: no back-fill. |
| Status | Live paper trading only. Read-only market data; no orders are ever sent. |

**Changing anything below, or the scan engine (`src/engine/scan.ts`) or the trader (`src/forward/trader.ts`), means a new strategy version (`-v2`) with a fresh count from zero.** Trades are always read per strategy version.

## Market data
- **Binance spot** klines for **BTCUSDT, ETHUSDT, SOLUSDT**, closed **1H** candles from `data-api.binance.vision`. Binance futures market data is geo-blocked from our runners, so the signals and fills are on **spot prices**. Costs are modelled as if trading Binance USDT-M perps (below), so spot/perp basis is ignored.
- Each hour the scan sees the last 400 closed candles, exactly like the app.

## Signal
- The app's scan with the default settings except **min R:R = 3** (below), both sides allowed, using **Zone 2 (Balanced)** only: entry = zone middle, stop = the scan's stop (zone edge ± 1.5 ATR, liq-nudged, widened by round-trip costs at a 0.05% fee), target = the scan's TP1 at **3R after costs (1:3 R:R)**. The whole position exits at TP1 (exit mode 0, no TP2). Prices are rounded to the 0.01 tick (stop rounded away from entry).
- The app's "entry on close" setting does not apply here: the virtual trader rests a limit order at the entry.

## Virtual trader (one per strategy × market)
- At most **1 pending limit order** and **1 open position**. **No new order while a position is open.**
- At each candle close, when flat:
  - no order and a setup shows → place one (both sides showing: higher confidence, then nearer entry);
  - order resting and the same side still shows, but its entry, stop or target moved more than **0.1 × ATR** → **cancel and replace** (logged as an event on the same trade, not a new trade);
  - order resting and that side no longer shows → **cancel**.
- An unfilled order **expires 24 bars** after it was first placed (replacing does not reset the clock).
- **One signal = one trade.** Cancelled and expired orders are **no trade**: they count only in the fill rate.

## Daily loss limit (pause, not a kill)
- Per virtual trader (market), realized R is summed over the **WIB calendar day** (00:00–24:00, UTC+7), by exit time.
- When it reaches **−3R or worse**: the pending order is cancelled, no new orders are placed for the rest of that WIB day, and a `daily limit hit` event is logged. **Open positions keep running** to their stop or target. Trading resumes at the next 00:00 WIB.

## Fills and exits (honest)
- A limit **fills only if price trades through the entry** by the larger of **1 tick or 0.02%** of price. A touch is not a fill. Fill price = the limit price.
- Stop: triggers when a candle reaches the stop; exit at the stop (or the open if it gapped through) minus **0.05% stop slippage**.
- Target: a resting limit, filled only when price trades through it by the same buffer.
- **Stop and target in the same candle = stop.** A stop inside the fill candle closes the trade in that candle; a target inside the fill candle is not counted.
- Order of work in a candle: open position (stop, then target) → pending order (fill, then expiry) → at the close, place/replace/cancel.

## Costs (in R, R = |entry − stop|)
- Binance USDT-M fees: **maker 0.02%** (entry, target), **taker 0.05%** (stop).
- Assumed spread on market (stop) exits: **0.02%**.
- **Funding**: summed over the funding times between fill and exit (longs pay positive rates, shorts receive), from Binance USDT-M funding history when reachable; otherwise **Hyperliquid's funding for the same coin as a proxy**, labelled `hl-proxy` on the trade.

## Finish line and pre-set rules
- Progress toward **30 closed trades (first read)** and **100 closed trades (decision)**, all three markets pooled.
- Reported: expectancy in R with a **95% confidence interval** (Student t), profit factor, max drawdown in R, fill rate (filled ÷ filled + cancelled + expired), win rate.
- **Kill** if, after 30 closed trades, the **upper 95% CI of expectancy is below 0**. This is the only kill rule. Max drawdown in R is reported as a stat only.
- **Promote** if the **lower 95% CI of expectancy is above 0 at 100 closed trades**.
- At 100+ trades with the CI still spanning 0: no edge shown (keep running or shelve; no rule changes inside this version).

## Frozen settings (`sanitize({ ...DEFAULTS, minRR: 3 })`)
```json
{
 "swingLen": 3,
 "rsiLen": 14,
 "rsiOB": 70,
 "rsiOS": 30,
 "divLookback": 30,
 "emaFast": 21,
 "emaSlow": 50,
 "atrLen": 14,
 "fvgMinAtr": 0.1,
 "obMustBreak": true,
 "obMaxAgeBars": 120,
 "breakerMaxRetests": 1,
 "inducementLookback": 20,
 "useBreakout": true,
 "boMult": 1.5,
 "boAvgLen": 20,
 "boLookback": 10,
 "threshold": 0,
 "useLiqMagnet": true,
 "gateStructure": true,
 "minOthers": 3,
 "heatmapWeight": 0.5,
 "stopAtr": 1.5,
 "minRR": 3,
 "leverage": 5,
 "useHtf": false,
 "entryOnClose": true,
 "exitMode": 0,
 "feeHyperliquid": 0.045,
 "feeBulk": 0.05,
 "feeBinance": 0.1,
 "slippagePct": 0,
 "useSpread": true,
 "weights": {
  "structure": 1,
  "fvgob": 1,
  "swings": 1,
  "breaker": 1,
  "inducement": 1,
  "rsi": 1,
  "ema": 1,
  "breakout": 1,
  "liqmagnet": 1
 }
}
```

## Not part of this test
- The old per-candle signal log (rules v1–v4) is research only. It gets no new rows from v3.0; its remaining open rows are still resolved. Nothing is deleted.
