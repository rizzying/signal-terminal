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

Both exits help Strong and do little for OK. The trail is slightly worse than current on 15m OK. The two positive cells are about +0.02R and +0.01R per trade. Those cells are the full sample. The sweep below is what decides whether a tuned exit is worth a November book.

## Parameter sweep

Same candles, same stop-first rule. Grids were fixed before this run: time exit every 2 bars from 4 to 32 (15), trail arm 0.5–2R by distance 0.5–2R (16), breakeven trigger 0.5–2R (4), partial 25/50/75% at 0.5–2R (12), target 1–3R (5), and a trail plus a time cap of 8/16/24/32 bars (64). Inside each family the setting is the one with the best profit-to-drawdown on the first two thirds of that slice, ordered by fill time. Ties keep the smaller parameter. The last third is only a check. A window under 30 trades is too early.

Dollars are R × $100. That is the book's display size (Settings › Labs), and it is the same on every trade. The paper book does not store a different dollar risk per coin, so the ratio is the same in R and in dollars. Drawdown and the losing streak are in exit-time order. A losing trade is R at or below zero. The worst trade stays near −1.3R to −1.5R in every family, because a stop that never moved is still a full loss after costs.

No replay was still open. The tune window for all trades is 15 Oct 15:00Z through 20 Oct 00:30Z (89). The check is 20 Oct 02:00Z through 23 Oct 00:45Z (45).

### All closed trades

| Rule | Best setting, chosen on the tune set | Tune R | Tune $ | Tune DD | Tune ratio | Check R | Check $ | Check DD | Check ratio | Check streak | Check worst |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Current | Stored target | −61.21 | −$6,121 | −63.24 | −0.97 | −9.94 | −$994 | −18.97 | −0.52 | 16 | −1.32 |
| Time exit | Exit after 4 bars | −20.82 | −$2,082 | −29.89 | −0.70 | −9.62 | −$962 | −12.71 | −0.76 | 14 | −1.26 |
| Trail + time cap | After +0.5R, trail 1R, exit after 8 bars | −26.22 | −$2,622 | −33.71 | −0.78 | −9.37 | −$937 | −10.83 | −0.86 | 10 | −1.26 |
| Partial, then breakeven | 75% off at +1R, then entry | −34.39 | −$3,439 | −37.31 | −0.92 | −11.98 | −$1,198 | −15.12 | −0.79 | 12 | −1.29 |
| Fixed target | Target at 1R | −32.26 | −$3,226 | −38.52 | −0.84 | −12.06 | −$1,206 | −13.95 | −0.86 | 12 | −1.29 |
| Breakeven | Stop to entry after +0.5R | −42.04 | −$4,204 | −44.12 | −0.95 | −15.00 | −$1,500 | −16.23 | −0.92 | 23 | −1.26 |
| Trailing stop | After +0.5R, trail 0.5R behind | −34.47 | −$3,447 | −42.27 | −0.82 | −14.49 | −$1,449 | −14.90 | −0.97 | 12 | −1.26 |

Ranked by the check-set ratio: current −0.52, time exit −0.76, partial −0.79, fixed target −0.86, trail plus time cap −0.86, breakeven −0.92, trailing stop −0.97.

On this check set the 4-bar exit and the trail-plus-8-bar cap lose about the same as current (within half an R) and their holes are shallower (−12.71R and −10.83R, against −18.97R). The ratio still ranks current first, because −9.94R is a smaller share of a deeper hole. Where the max-profit setting inside a family differed, its check set was worse: a 1R trail after +0.5R lost −13.87R on the check, and the same trail with a 16-bar cap lost −15.38R.

### 15m

Tune 67 (16 Oct 08:00Z → 19 Oct 22:30Z). Check 34 (20 Oct 00:30Z → 23 Oct 00:45Z). Both windows are at least 30.

| Rule | Best setting on the tune set | Tune R | Tune $ | Tune ratio | Check R | Check $ | Check DD | Check ratio | Check streak | Check worst |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Current | Stored target | −44.80 | −$4,480 | −0.94 | +2.10 | +$210 | −14.64 | +0.14 | 12 | −1.37 |
| Time exit | Exit after 4 bars | −9.71 | −$971 | −0.44 | −4.91 | −$491 | −9.69 | −0.51 | 10 | −1.37 |
| Trail + time cap | After +0.5R, trail 1R, exit after 8 bars | −15.37 | −$1,537 | −0.58 | −3.23 | −$323 | −6.29 | −0.51 | 6 | −1.37 |
| Partial, then breakeven | 75% off at +1R, then entry | −20.29 | −$2,029 | −0.71 | −5.34 | −$534 | −10.19 | −0.52 | 7 | −1.37 |
| Breakeven | Stop to entry after +0.5R | −30.95 | −$3,095 | −0.90 | −6.96 | −$696 | −10.70 | −0.65 | 18 | −1.37 |
| Fixed target | Target at 1R | −18.33 | −$1,833 | −0.61 | −6.40 | −$640 | −8.49 | −0.75 | 7 | −1.37 |
| Trailing stop | After +1R, trail 0.5R behind | −20.60 | −$2,060 | −0.65 | −9.87 | −$987 | −9.87 | −1.00 | 6 | −1.37 |

Current is the only rule in profit on the 15m check set, and it has the only positive ratio. The 4-bar exit looks much better on the tune set (−9.71R against −44.80R) and then loses on the check set. The max-profit trail on the tune set (1R behind after +0.5R, −18.18R) loses −8.51R on the check.

### 15m Strong

Tune 38, which clears 30. Check 19, which does not. Read it as a hint.

| Rule | Best setting on the tune set | Tune R | Tune $ | Tune ratio | Check R | Check $ | Check ratio |
|---|---|---:|---:|---:|---:|---:|---:|
| Current | Stored target | −16.71 | −$1,671 | −0.84 | +3.10 | +$310 | +0.51 |
| Trail + time cap | After +0.5R, trail 1R, exit after 16 bars | +2.66 | +$266 | +0.42 | −3.00 | −$300 | −0.64 |
| Trailing stop | After +0.5R, trail 1R behind | +1.93 | +$193 | +0.30 | −0.35 | −$35 | −0.10 |
| Time exit | Exit after 4 bars | +0.73 | +$73 | +0.11 | −1.01 | −$101 | −0.29 |
| Partial, then breakeven | 75% off at +1R, then entry | +0.49 | +$49 | +0.07 | −0.79 | −$79 | −0.17 |
| Fixed target | Target at 1R | −0.22 | −$22 | −0.03 | +0.20 | +$20 | +0.04 |
| Breakeven | Stop to entry after +1R | −7.39 | −$739 | −0.70 | +1.39 | +$139 | +0.27 |

The rules that make money on the tune set lose it on the check set. The check set is under 30, so this slice cannot pick a November book.

## Batch 2 candidates

Ranked after the holdout. The October book stays the control. No new paper book was started.

1. **Keep the current exit.** On the check set it has the best profit-to-drawdown of every family, both overall (45 trades, ratio −0.52, −$994) and on 15m (34 trades, ratio +0.14, +$210). The 15m tune window is still −44.80R, so the positive check set is not an edge. It is the rule that was not fitted to the earlier trades. The full-sample 8-bar and 1R-trail results above remain a description of all 134 trades. They were not the settings this sweep selected, and the settings it did select did not beat current on the trades they had not seen.

2. **Do not paper the in-sample winners.** Exit after 4 bars, a 0.5R trail, a 75% partial at +1R, a 1R target, and a 1R trail after +0.5R with an 8-bar cap. Each was the best ratio inside its family on the tune set. On the check set every one has a worse ratio than current. On 15m every one loses. Their shallower holes on the all-trades check set come with about the same loss, and the 15m check set takes the profit away.

3. **Leave 15m Strong out of the design.** The tune set (38) can show +2.66R for a 1R trail after +0.5R with a 16-bar cap. The check set (19, too early) is −3.00R for that same rule. A positive cell on the trades used to pick the rule is the pattern the holdout is there to catch.

4. **No change to the displayed best, and no change to the October trader.** The audit above is clean. 12 fill-candle stops are the live rule. 4h, Weak, High confidence, Low confidence, and every book except 15m Zone 1's stop count are under 30.
