// @vitest-environment node
import { step, settle, type State, type Trade } from "../src/forward/trader";
import type { Candle } from "../src/engine/indicators";
import { excursion } from "../src/forward/shadow.js";
import { blankRule, betterProfit, chooseBest, chronoSplit, confBand, median, mfeIncludingFill, pageMfe, pathMfe, profitDdRatio, replay, replayRule, riskScore, ruleFromVariant, score, SWEEP, targetAt, targetAudit, TIME_BARS, VARIANTS, type Leg } from "../scripts/exitStudy";

const H = 3.6e6; const M = "BTCUSDT";
const k = (i: number, o: number, h: number, l: number, c: number): Candle => ({ t: i * H, o, h, l, c, v: 1 });
const plan = { side: "long" as const, entry: 100, sl: 90, tp: 130, atr: 5, conf: 60 };
const leg: Leg = { market: M, side: "long", entry: 100, sl: 90, tp: 130, risk: 10, fillT: 2 * H, barMs: H };

function book(bars: Candle[]): Trade {
  let st: State = { order: null, pos: null };
  let r = step(st, bars[0], [plan], M); st = r.state;
  const closed: Trade[] = [];
  for (const b of bars.slice(1)) { r = step(st, b, [], M); st = r.state; closed.push(...r.closed.filter((c) => c.status === "closed")); }
  expect(closed).toHaveLength(1);
  return closed[0];
}

it("the current replay matches the live trader, including a stop on the way to the target", () => {
  const bars = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 112, 99, 110), k(3, 110, 131, 89, 90)];
  const live = book(bars);
  expect(live.fill_t).toBe(2 * H); expect(live.exit_reason).toBe("sl");
  const again = replay(leg, bars, "current", "stopFirst");
  expect(again.missing).toBe(false); expect(again.reason).toBe("sl"); expect(again.r).toBeCloseTo(live.r_net!, 9);
  expect(again.ambiguous).toBe(true);
  const rosy = replay(leg, bars, "current", "favorableFirst");
  expect(rosy.reason).toBe("tp"); expect(rosy.ambiguous).toBe(true); expect(rosy.r).toBeGreaterThan(1);
});

it("a stop to entry waits for the next candle, and a same-candle wick back to the stop stays a stop", () => {
  const armed = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 106, 99.5, 105), k(3, 105, 106, 89, 90)];
  const be = replay(leg, armed, "be05", "stopFirst");
  expect(be.reason).toBe("be"); expect(be.exitT).toBe(4 * H); expect(be.ambiguous).toBe(false);
  expect(be.r).toBeLessThan(0); expect(be.r).toBeGreaterThan(-0.2);
  const both = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 112, 89, 90)];
  const stop = replay(leg, both, "be10", "stopFirst");
  const rosy = replay(leg, both, "be10", "favorableFirst");
  expect(stop.reason).toBe("sl"); expect(stop.ambiguous).toBe(true); expect(stop.r).toBeCloseTo(book(both).r_net!, 9);
  expect(rosy.reason).toBe("be"); expect(rosy.r).toBeGreaterThan(stop.r!);
});

it("a 50% partial at +1R banks the maker fill and stops the rest at entry", () => {
  const bars = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 111, 100, 110), k(3, 110, 111, 99, 100)];
  const p = replay(leg, bars, "partial1", "stopFirst");
  expect(p.reason).toBe("be"); expect(p.ambiguous).toBe(false);
  const half = 0.5 * settle({ market: M, side: "long", status: "open", placed_t: 0, entry: 100, sl: 90, tp: 130, risk: 10, conf: 0, replaced: 0, fill_t: 2 * H, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null }, 110, "tp", 2 * H).r_net!;
  expect(p.r).toBeGreaterThan(half - 0.2); expect(p.r).toBeLessThan(half);
});

it("a 2R target uses the same cost padding as the stored 3R target and fills sooner", () => {
  const padded: Leg = { ...leg, tp: 132 };
  expect(targetAt(padded, 2)).toBeCloseTo(122, 8);
  const bars = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 123, 99.5, 121)];
  const near = replay(padded, bars, "tp20", "stopFirst");
  const cur = replay(padded, bars, "current", "stopFirst");
  expect(near.reason).toBe("tp"); expect(cur.reason).toBe("open");
});

it("eight quiet bars exit at the close, and the fill candle is not one of them", () => {
  const bars = [k(1, 101, 101, 99, 100)];
  for (let i = 2; i <= 9; i++) bars.push(k(i, 100, 101, 99.5, 100.2));
  const t = replay(leg, bars, "time8", "stopFirst");
  expect(t.reason).toBe("time"); expect(t.exitT).toBe(10 * H); expect(t.r).toBeCloseTo(settle({ market: M, side: "long", status: "open", placed_t: 0, entry: 100, sl: 90, tp: 130, risk: 10, conf: 0, replaced: 0, fill_t: leg.fillT, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null }, 100.2, "sl", leg.fillT).r_net!, 9);
});

it("the page's best skips the fill candle, and a target touched earlier without a stop is a miss", () => {
  const bars = [k(1, 100, 125, 99, 100), k(2, 100, 101, 99.5, 100.5), k(3, 100.5, 101, 89, 90)];
  expect(pathMfe(leg, bars, 4 * H).mfe).toBeCloseTo(0.1, 6);
  expect(pathMfe(leg, bars, 4 * H).barsToMfe).toBe(1);
  expect(mfeIncludingFill(leg, bars, 4 * H)).toBeCloseTo(2.5, 6);
  expect(pageMfe(leg, bars, 4 * H)).toBeCloseTo(pathMfe(leg, bars, 4 * H).mfe, 9);
  const through = [k(1, 100, 101, 99, 100), k(2, 100, 131, 99.5, 130), k(3, 120, 121, 89, 90)];
  expect(targetAudit(leg, through, 4 * H)).toEqual({ missedTarget: true, missedStop: false, sameCandle: false });
  const same = [k(1, 100, 101, 99, 100), k(2, 100, 131, 89, 90)];
  expect(targetAudit(leg, same, 3 * H)).toEqual({ missedTarget: false, missedStop: false, sameCandle: true });
  expect(excursion({ side: "long", entry: 100, sl: 90, risk: 10 }, bars, leg.fillT, 4 * H, undefined).mfe).toBeCloseTo(0.1, 6);
});

it("a short trail ratchets the stop down and a small sample is marked early", () => {
  const s: Leg = { market: M, side: "short", entry: 100, sl: 110, tp: 70, risk: 10, fillT: 2 * H, barMs: H };
  const bars = [k(1, 100, 101, 99, 100), k(2, 99, 100, 88, 90), k(3, 90, 100, 89, 99)];
  const tr = replay(s, bars, "trail1", "stopFirst");
  expect(tr.reason).toBe("trail"); expect(tr.r).toBeGreaterThan(0);
  expect(confBand(null)).toBe("Unknown"); expect(confBand(70)).toBe("Med"); expect(confBand(71)).toBe("High"); expect(confBand(49)).toBe("Low");
  expect(score([{ r: 1, exitT: 1 }, { r: -1, exitT: 2 }]).early).toBe(true);
  expect(median([1, 3, 2, 4])).toBe(2.5);
  for (const v of VARIANTS) {
    const a = replay(s, bars, v, "stopFirst");
    const b = replayRule(s, bars, ruleFromVariant(v), "stopFirst");
    expect(b.reason).toBe(a.reason); expect(b.exitT).toBe(a.exitT); expect(b.r).toBe(a.r);
  }
});

it("a shorter time stop exits sooner, and a tighter trail keeps more of the move", () => {
  const quiet = [k(1, 101, 101, 99, 100)];
  for (let i = 2; i <= 9; i++) quiet.push(k(i, 100, 101, 99.5, 100.2));
  const four = replayRule(leg, quiet, { ...blankRule(), timeBars: 4 }, "stopFirst");
  expect(four.reason).toBe("time"); expect(four.exitT).toBe(6 * H);
  const run = [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 121, 100.5, 118), k(3, 118, 118, 104, 106), k(4, 106, 107, 89, 90)];
  const tight = replayRule(leg, run, { ...blankRule(), trailArm: 1, trailDist: 0.5 }, "stopFirst");
  const wide = replayRule(leg, run, { ...blankRule(), trailArm: 1, trailDist: 2 }, "stopFirst");
  expect(tight.reason).toBe("trail"); expect(tight.r).toBeGreaterThan(0); expect(tight.r!).toBeGreaterThan(wide.r!);
  const part = replayRule(leg, [k(0, 101, 102, 100.5, 101), k(1, 101, 101, 99, 100), k(2, 100, 111, 100, 110), k(3, 110, 111, 99, 100)], { ...blankRule(), partialFrac: 0.25, partialAt: 1 }, "stopFirst");
  expect(part.reason).toBe("be"); expect(part.r).toBeGreaterThan(0); expect(part.r!).toBeLessThan(1);
});

it("the tune set is the first two thirds by fill time, and the pick ignores the holdout", () => {
  const rows = [5, 1, 3, 2, 4].map((fillT) => ({ id: `F-${fillT}`, fillT }));
  const split = chronoSplit(rows);
  expect(split.train.map((r) => r.fillT)).toEqual([1, 2, 3]);
  expect(split.test.map((r) => r.fillT)).toEqual([4, 5]);
  const picked = chooseBest([
    { id: "thin", rows: [{ r: 1, exitT: 1 }, { r: -0.2, exitT: 2 }] },
    { id: "deep", rows: [{ r: 3, exitT: 1 }, { r: -2, exitT: 2 }] },
  ]);
  expect(picked!.id).toBe("thin");
  expect(picked!.score.ratio).toBeGreaterThan(1);
  expect(riskScore([{ r: -1, exitT: 2 }, { r: -1, exitT: 1 }, { r: 0, exitT: 3 }, { r: 1, exitT: 4 }]).loseStreak).toBe(3);
  expect(profitDdRatio(10, -5)).toBe(2);
  expect(profitDdRatio(-10, -5)).toBe(-2);
  expect(profitDdRatio(1, 0)).toBe(Infinity);
  expect(betterProfit(riskScore([{ r: 2, exitT: 1 }]), riskScore([{ r: 1, exitT: 1 }]))).toBe(true);
  expect(TIME_BARS[0]).toBe(4); expect(TIME_BARS.at(-1)).toBe(32);
  expect(SWEEP.map((f) => f.rules.length)).toEqual([15, 16, 4, 12, 5, 64]);
  expect(riskScore([{ r: -1.5, exitT: 1 }]).totalUsd).toBe(-150);
  expect(riskScore([{ r: 1, exitT: 1 }, { r: -1, exitT: 2 }]).early).toBe(true);
});
