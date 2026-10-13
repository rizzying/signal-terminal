# Liquidation heatmap (estimate) — plain words

**What it is.** A guess at where *other traders* would get liquidated. No exchange (Bulk, Hyperliquid or Binance) publishes everyone's positions, so Signal estimates it. It is **not** your position. Your own liquidation is shown separately on each zone card as "Your liq".

**How it's estimated, per exchange.** For the market and exchange you're looking at:
1. Each candle's traded volume on **that exchange** is treated as new positions, half long and half short, opened around that candle's typical price.
2. That volume is spread across typical leverage levels (5×, 10×, 20×, 25×, 40×), capped at **that market's max leverage on that exchange** (for example BTC 40× on Bulk, MON 10× on Bulk).
3. Each position's liquidation price uses **that exchange's maintenance margin**. Hyperliquid and Bulk use half the initial margin at max leverage (1 ÷ (2 × max leverage)). Anything else uses 0.5%.
4. A level is removed once price has traded through it (those traders are assumed liquidated or out). Older volume counts less (half-life of 72 candles).

So the same coin can show different clusters on Bulk and Hyperliquid. Volume, max leverage and margin rules differ. Binance here is **spot** (no liquidations at all), so on Binance the map only uses spot volume as a rough stand-in. Treat it as the weakest of the three.

**How Signal uses it (v2.6).**
- **Liq zones as entries.** A heavy cluster is at least half the size of the biggest one on that side. Short liquidations above price (for shorts) or long liquidations below price (for longs) count. Price often gets pulled to these, so each one becomes a candidate entry zone ("Liq zone"). It is ranked with order blocks, FVGs and swings. If a cluster sits within 0.3 ATR of an existing zone, that zone is stretched to cover it, and its source reads "… + Liq zone".
- **Liq magnet signal.** Passes when a heavy cluster is inside one of the entry zones or within 0.5 ATR of it. It's a weighted signal: on by default (weight 1) in "Signal default", and you can switch it off or reweight it in Settings. It's off in the other built-in strategies so their tested numbers stay valid.
- **Stops.** The stop sits beyond the whole zone, cluster included, plus the ATR buffer and costs. A cluster just past the stop pushes the stop further out. A sweep through the cluster shouldn't stop you out.
- **Chart.** Dotted grey "Shorts liq zone" / "Longs liq zone" lines show up to 3 of the heaviest clusters on the trade side.

**Limits.** It's a model built from volume. It can't see real leverage, hedges, cross margin or positions opened elsewhere. The backtest study (docs/BACKTEST.md) found no proven edge in the scan signals. The Liq magnet signal and liq-zone entries have **not** been through that study yet.
