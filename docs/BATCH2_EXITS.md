# Batch 2 exit study

Read on 23 Oct 2026 from the public book at `https://signal-terminal-psi.vercel.app/api/paper`, with candles from `data-api.binance.vision`. The October forward test is unchanged. This study does not place orders, write the database, or start a paper book.

287 trades on the book. 134 filled and closed: 113 stopped, 21 at the stored target. Replay of the current rule matches stored R excluding funding within 0.05R on all 134. Zone strength matched the placement replay on 133 of 134. The one Unknown is the frozen v1 trade.

Rules were fixed before the live numbers were read. On a candle the active stop wins. A breakeven, partial, or trail seen on a candle that also hits the stop does not arm, and it applies from the next candle. The fill candle can stop the trade and cannot arm anything. "Breakeven" is the entry price, so fees and stop slippage make that exit a small loss. A win is R above zero. Funding is left out of every variant so the comparison is the exit. The other reading, where a same-candle favorable wick happens first, is a sensitivity only. A cell under 30 closed trades is too early.

## The stopped trades did go in profit first

"Best" on the page is the most favorable price after the fill candle, in gross R, and it is not used to exit. Across 113 stops the median best is +0.49R, a median of 6 bars after the fill. 54 reached +0.5R, 37 reached +1R, 18 reached +1.5R, and 14 reached +2R.

Of the 54 stops that reached +0.5R, the best print was a median of 10 bars after the fill, and the stop came a median of 12 bars after that print. The giveback is a later candle. An exit rule can arm. An 8-bar time stop usually fires before that best print.

| Group | Stops | Median best | ≥0.5R | ≥1R | Note |
|---|---:|---:|---:|---:|---|
| All stops | 113 | +0.49R | 54 | 37 | |
| 15m | 82 | +0.50R | 41 | 31 | |
| 15m Zone 1 | 35 | +0.73R | 20 | 15 | Only book with 30 or more stops |
| 1h | 29 | +0.30R | 12 | 6 | Too early |
| 4h | 2 | | | | Too early |
| Strong | 59 | +0.93R | 35 | 26 | |
| OK | 38 | +0.38R | 15 | 9 | |
| Weak | 15 | +0.11R | 4 | 2 | Too early |
| Med confidence | 80 | +0.47R | 37 | 26 | |
| High confidence | 20 | +0.62R | 11 | 6 | Too early |
| Low confidence | 13 | +0.31R | 6 | 5 | Too early |

Strong stops travel much further than OK stops. Confidence is not a split to design around yet. High and Low are under 30.

## The displayed best is not a bug

- 0 stopped trades have a displayed best more than 0.05R away from a fresh reading of the same rule.
- 0 displayed bests look like the fill candle was included. That candle is skipped because its wick may be from before the fill. 12 stops happened on the fill candle itself, which is the live rule.
- 0 closed trades traded through the target on an earlier candle that missed the stop.
- 0 closed trades hit the stop earlier than the recorded exit.
- 0 exit candles contained both the stop and the target.

Nothing in the excursion code needs a fix before November.

## Replaying the closed trades

Same candles, nine exits. Stop-first is the headline. "If wick first" is the sensitivity. "Gave back" counts stored targets this variant did not take. Every variant is still a loss on the full 134.

| Variant | Win rate | Total R | Avg R | Max DD | If wick first | Gave back |
|---|---:|---:|---:|---:|---:|---:|
| Current (stop, then the stored target) | 16% | −71.14 | −0.53 | −81.15 | −71.14 | |
| Stop to entry after +0.5R | 7% | −57.04 | −0.43 | −60.35 | −57.04 | 12 |
| Stop to entry after +1R | 11% | −54.02 | −0.40 | −63.18 | −54.02 | 6 |
| 50% off at +1R, stop to entry on the rest | 41% | −49.92 | −0.37 | −55.68 | −49.92 | 6 |
| Trail the stop 1R behind, after +1R | 33% | −48.06 | −0.36 | −52.89 | −47.91 | 14 |
| Target at 1.5R | 28% | −57.52 | −0.43 | −61.32 | −57.52 | |
| Target at 2R | 24% | −55.49 | −0.41 | −62.80 | −55.49 | |
| Exit at the close after 8 bars | 39% | −37.70 | −0.28 | −46.57 | −37.70 | 17 |
| Exit at the close after 16 bars | 33% | −48.81 | −0.36 | −56.29 | −48.81 | 14 |

Intrabar ambiguity does not explain the giveback. The ambiguous count is 0 for every variant except the trail, which has one trade. The wick-first column matches the headline except for that one trade (0.15R). The partial's 41% win rate is the half-position banked at +1R. Total R is still about −50.

By timeframe, stop-first total R:

| Variant | 15m (n=101) | 1h (n=31) | 4h (n=2) |
|---|---:|---:|---:|
| Current | −42.70 | −26.32 | −2.12, too early |
| Stop to entry after +0.5R | −37.91 | −18.01 | |
| Stop to entry after +1R | −31.58 | −20.32 | |
| 50% at +1R, then entry | −28.61 | −19.18 | |
| Trail 1R after +1R | −27.39 | −18.54 | |
| Target at 1.5R | −36.56 | −18.83 | |
| Target at 2R | −34.44 | −18.93 | |
| Exit after 8 bars | −17.52 | −19.57 | |
| Exit after 16 bars | −31.50 | −16.23 | |

The 8-bar exit is the least bad rule on 15m. On 1h the 16-bar exit is slightly less bad than 8 bars, and 31 trades is a first read only. Do not copy an 8-bar rule onto 1h or 4h.

By strength, all timeframes, the same five variants:

| Variant | Strong (n=73) | OK (n=45) | Weak (n=15) |
|---|---:|---:|---:|
| Current | −26.98 | −25.04 | −18.05, too early |
| Stop to entry after +1R | −14.36 | −22.54 | |
| 50% at +1R, then entry | −9.25 | −23.13 | |
| Trail 1R after +1R | −6.45 | −24.76 | |
| Exit after 8 bars | −5.20 | −19.70 | |

15m only, which is the slice large enough to read:

| Variant | Strong (n=57) | OK (n=31) | Weak (n=13) |
|---|---:|---:|---:|
| Current | −13.61 | −13.24 | −15.84, too early |
| Trail 1R after +1R | +1.28 | −15.10 | |
| Exit after 8 bars | +0.65 | −8.64 | |

Both exits help Strong and do little for OK. The trail is slightly worse than current on 15m OK. The two positive cells are about +0.02R and +0.01R per trade. Crossing zero in one cell is not an edge. It is the place a November book can look.

## Batch 2 candidates

Ranked for a November design. The October book stays the control. No new paper book was started.

1. **15m book that exits at the close after 8 bars.** Largest improvement among the rules that were fixed in advance, on the only timeframe with a large closed sample (101 trades: −17.52R against −42.70R). Wick-first is identical. The full 15m book is still negative. It gives back 17 of the 21 three-R targets, and for stops that reached +0.5R the best print is a median of 10 bars after the fill, so this exit usually happens before the move the screenshot shows. It is a shorter hold. On 15m Strong (57) the cell is +0.65R. On 15m OK (31) it is still −8.64R. Do not apply it to 1h: there, 16 bars (−16.23R, n=31) is less bad than 8 bars (−19.57R).

2. **15m book that, after +1R, trails the stop 1R behind the best price and otherwise keeps the stored target.** This is the rule that answers a trade going in favor and then coming back. Overall −48.06R against −71.14R. On 15m, −27.39R against −42.70R, still a loss. The strength split is why it is a separate candidate: 15m Strong (57) goes from −13.61R to +1.28R, and 15m OK (31) goes from −13.24R to −15.10R. One ambiguous trade in the whole sample. The wick-first total (−47.91R) does not change its rank against the 8-bar exit. It keeps more of the three-R winners than the time stop (14 given back, against 17). +1.28R on 57 trades is a reason to test the mechanism, not a result to trade.

3. **Leave these out of the first November batch.** Stop to entry after +0.5R (−57.04R, 12 targets given back). The median stop only reaches +0.49R, so the stop jumps to entry on a marginal touch and the win rate falls to 7%. Stop to entry after +1R and the 50% partial lose less than current and more than the trail. The partial's 41% win rate is the half banked at +1R. A 1.5R target (−57.52R) and a 2R target (−55.49R) also lose less than current and more than either candidate above. They do not use the fact that the stop arrives a median of 12 bars after the best print.

4. **No change to the displayed best, and no change to the October trader.** The audit above is clean. 12 fill-candle stops are the live rule. 4h (2 closed trades), Weak, High confidence, Low confidence, and every book except 15m Zone 1's stop count are too early to pick an exit from.
