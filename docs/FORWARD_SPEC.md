# Forward test spec (v3.2.0)

Nine paper scorecards on Binance spot. The headline is **1H Zone 2**. It is listed first everywhere (the page, `/api/paper`, `/api/forward`). The other eight are the same coins and the same rules on the other zones and timeframes. Nothing is blended.

| | |
|---|---|
| Headline | `bn-1h-z2-v2` · rules hash `c376e7f0` |
| Other live books | `bn-<tf>-z<n>-v2` for tf in `15m`, `1h`, `4h` and zone in 1, 2, 3, except the headline |
| Legacy (frozen, no new trades) | `bn-1h-z2-v1` · rules hash `b81ceeeb` |
| Started | v2 books start on the first hourly run after this ships. No back-fill. v1 rows stay as they are. |
| Status | Paper only. Read-only market data. No orders are ever sent. |

Report order: headline, then 15m Z1–Z3, 1H Z1, 1H Z3, 4H Z1–Z3, then the legacy v1 card.

Each live book has its own rules hash (FNV-1a of that book's spec in `src/forward/trader.ts`). `tests/paper.test.ts` checks the headline hash, the legacy hash, and that `src/forward/books.js` matches the trader.

## What changed in v3.2, and what did not

- **Locked orders.** Once an order is placed, its entry, stop and target stay put until it fills or expires. The job does not cancel-and-replace when the setup moves, and it does not cancel because the setup disappeared. `replace` events are not written anymore. Old `replace` events stay in the log.
- **One order at a time, per coin, per scorecard.** A new order for that coin on that scorecard is placed only after the previous one has fully closed (filled and then exited, or expired). The daily-loss pause can still cancel a pending order. It is the only cancel.
- **Zones 1 and 3, and 15m and 4H**, on the same three coins and the same Binance spot feed. Nine independent books. One pending order and one position per coin per book.
- **Expiry is 24 bars of that book's own timeframe** (24×15m, 24×1H, or 24×4H).
- **Unchanged:** the coins (BTC, ETH, SOL), the zone and signal rules, the fill rule, costs, funding, same-candle = stop, 1:3 reward, and the −3R daily pause. Past trades are not deleted or rewritten.

## Market data

- **Binance spot** klines for **BTCUSDT, ETHUSDT, SOLUSDT** from `data-api.binance.vision`. Intervals `15m`, `1h` and `4h`. Signals and fills use spot prices. Costs are modelled as Binance USDT-M perps, so spot/perp basis is ignored.
- Each book sees the last 400 closed candles of its own timeframe.
- The hourly job processes **every closed candle since that book's cursor**, oldest first. A normal hour is four 15m candles, one 1H candle, and sometimes one 4H candle. One run will also catch up to a week of missed candles. A longer gap is continued on the next run. The cursor is never moved past a candle that was not processed, and a hole in the fetched candles is not skipped.

## Signal

- The app's scan with the default settings except **min R:R = 3**, both sides allowed. Entry = zone middle, stop = the scan's stop, target = TP1 at **3R after costs**. The whole position exits at TP1 (exit mode 0). Prices are rounded to the 0.01 tick (stop rounded away from entry).
- Zone 1, 2 or 3 is the only difference between books on the same timeframe. The scan runs once per side per candle and each book takes its own rank.
- The app's "entry on close" setting does not apply. The virtual trader rests a limit at the entry.

## Virtual trader (one per scorecard × market)

- At most **1 pending limit order** and **1 open position**. No new order while either is open.
- At each candle close, when flat and the daily pause is not on: if a setup shows, place one (both sides showing: higher confidence, then nearer entry).
- A resting order is left alone when the setup moves or vanishes.
- An unfilled order **expires after 24 bars of this timeframe**. The placement candle does not count. Expiry does not reset.
- **One signal = one trade.** Cancelled and expired orders are no trade. They count only in the fill rate.

## Daily loss limit (per scorecard, per coin)

- Realized R is summed over the **WIB calendar day** (half-open: from 00:00 up to but not including the next 00:00, UTC+7), by exit time, **for that scorecard and that coin only**. A loss on 15m Zone 1 does not pause 1H Zone 2. A candle closing at exactly 00:00 WIB belongs to the new day.
- At **−3R or worse**: the pending order on that book is cancelled, no new order is placed on that book for the rest of the WIB day, and a `daily limit hit` event is logged. **Open positions keep running.** The other eight books are not paused. Trading on that book resumes at the next 00:00 WIB.

## Fills and exits

- A limit **fills only if price trades through the entry** by the larger of **1 tick or 0.02%** of price. A touch is not a fill. Fill price = the limit price.
- Stop: triggers when a candle reaches the stop; exit at the stop (or the open if it gapped through) minus **0.05% stop slippage**.
- Target: a resting limit, filled only when price trades through it by the same buffer.
- **Stop and target in the same candle = stop.** A stop inside the fill candle closes the trade. A target inside the fill candle does not.
- Order of work in a candle: open position (stop, then target) → pending order (fill, then expiry) → daily limit → if flat, place. No replace step.

## Costs (in R, R = |entry − stop|)

- Binance USDT-M fees: **maker 0.02%** (entry, target), **taker 0.05%** (stop).
- Assumed spread on market (stop) exits: **0.02%**.
- **Funding**: summed over the funding times between fill and exit (longs pay positive rates, shorts receive), from Binance USDT-M funding history when reachable; otherwise **Hyperliquid's funding for the same coin as a proxy**, labelled `hl-proxy`.

## How a scorecard is read

Each book reports, with the counts next to the rates:

- Closed trades (filled and exited).
- Fill rate = filled ÷ (filled + cancelled + expired).
- TP rate and SL rate among closed trades.
- Average result in R (and in dollars at the reader's risk setting on the page).

The headline book also keeps the finish line, judged on **that book's three coins only**:

- **30 closed trades** is the first read. **100** is the decision.
- Expectancy in R with a **95% confidence interval** (Student t), profit factor, max drawdown in R.
- **Kill** if, after 30 closed trades, the upper 95% CI of expectancy is below 0.
- **Promote** if the lower 95% CI is above 0 at 100 closed trades.
- At 100+ with the CI still spanning 0: no edge shown.

v1 is a separate legacy card. It is not added into the 1H Zone 2 v2 numbers. Sample sizes split across the nine books, so each book will take longer to reach 30 and 100 than the old single book did.

## Versioning and the database

- New trades and events are written with their book's strategy id (`bn-<tf>-z<n>-v2`) and that book's rules hash.
- Rows already stored as `bn-1h-z2-v1` stay on that id, with hash `b81ceeeb`. The migration only relabels a row whose strategy is the bare `bn-1h-z2` (none are expected). It does not update a row that is already v1 or v2, and it does not delete anything. Running it twice changes nothing the second time.
- Each book has its own cursor in `fwd_trader` (`strategy`, `market`). v2 does not resume the v1 cursor.

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

- The old per-candle signal log (rules v1–v4) is research only. It gets no new rows. Its remaining open rows are still resolved. Nothing is deleted.
- v1 virtual-trader rows (`bn-1h-z2-v1`) are history. The job does not add to them.
