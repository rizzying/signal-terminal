# Zone strength

Each of a setup's three zones is labelled **Strong**, **OK**, or **Weak**. The label is level quality. It is separate from the one direction confidence on the setup (Low / Medium / High), which is the share of signals that agree and is not a win chance.

The grade is display-only. It does not move entries, stops, targets, zone rank, `shown`, confidence, or the forward-test rules hashes. The forward books still read `entry`, `stop`, `t1`, `atr`, and `confidence` only.

## What is measured

All of these are numbers the engine already computes while it builds zones and signals. Nothing new is fetched.

| Input | Where it already exists |
| --- | --- |
| Structure kind | Order block, fair value gap, breaker, swing, a liquidation cluster that only exists because structure is within 1 ATR, or an ATR step with no structure |
| Liquidation cluster on real structure | The cluster merge that appends `+ Liq zone` to the source |
| Stop nudged past a cluster | The existing stop-nudge note |
| Distance in ATR | Near edge of the zone versus price, divided by ATR. Inside the zone counts as 0 |
| Touches / freshness | Breaker retest count. Age in bars of an order block, fair value gap, or swing (capped by the existing 120-bar OB/FVG window; swings have no separate cap) |
| Signal agreement | The structure signal, plus the signal that matches this level (FVG/OB, breaker, or swings). A signal that is switched off (weight 0) does not count. This is not a second confidence and not a vote across saved strategies |

An ATR step has no structure, so it is always **Weak**, even if it sits close to price.

## Points

| Fact | Points |
| --- | --- |
| Order block, fair value gap, breaker, or swing | +2 |
| Standalone liq cluster (it only appears within 1 ATR of structure) | +1 |
| ATR step | +0, and the label is Weak |
| Liquidation cluster merged onto real structure | +2 |
| Stop moved past a cluster | +1 |
| Near edge within 1 ATR (including price inside the zone) | +2 |
| Near edge within 2 ATR | +1 |
| Farther than 2 ATR | +0 |
| Breaker with 0 retests | +2 |
| Breaker with 1 retest | +1 |
| OB, FVG, or swing formed within 20 bars | +2 |
| OB, FVG, or swing formed within 60 bars | +1 |
| Structure signal agrees and is on | +1 |
| The signal for this level's kind agrees and is on | +1 |

**Strong** is 6 or more. **OK** is 3 to 5. **Weak** is under 3, and every ATR step.

The same facts always produce the same label. The count is not shown in the product, so it is not read as a probability.
