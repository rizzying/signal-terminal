import { backtest } from "../src/engine/backtest";
import { simulate, stats, type BarSig } from "../src/engine/sim";
import { DEFAULTS, sanitize } from "../src/engine/settings";
import type { Candle } from "../src/engine/indicators";
const mk = (n: number, f: (i: number) => number): Candle[] => Array.from({ length: n }, (_, i) => { const x = f(i); return { t: i * 3.6e6, o: x, h: x * 1.006, l: x * 0.994, c: x * 1.001, v: 10 + (i % 7) }; });
const S = sanitize({ ...DEFAULTS, minOthers: 1 });
describe("backtest", () => {
  const c = mk(700, (i) => 100 + 0.05 * i + 5 * Math.sin(i / 6));
  const r = backtest({ candles: c, startIdx: 300, settings: S, zone: 1, margin: 1000, feePct: 0.045, spreadPct: 0.02 });
  it("one position at a time", () => { for (let k = 1; k < r.trades.length; k++) expect(r.trades[k].entryT).toBeGreaterThanOrEqual(r.trades[k - 1].exitT); expect(r.equity).toHaveLength(400); });
  it("no lookahead", () => {
    const c2 = [...c.slice(0, 600), ...mk(100, () => 1)];
    const r2 = backtest({ candles: c2, startIdx: 300, settings: S, zone: 1, margin: 1000, feePct: 0.045, spreadPct: 0.02 });
    const before = (x: typeof r) => x.trades.filter((t) => t.exitT < 599 * 3.6e6).map((t) => [t.entryT, t.exitT, t.pnl]);
    expect(before(r2)).toEqual(before(r));
  });
  it("buy and hold benchmark", () => expect(r.holdReturn).toBeCloseTo(100 * ((c[699].c / c[300].o) * (1 - 0.00045) ** 2 - 1), 6));
});
// hand-made candles + a single long signal: zone [99,100], ATR 1
const bar = (t: number, o: number, h: number, l: number, cl: number): Candle => ({ t, o, h, l, c: cl, v: 1 });
const sig = (n: number): BarSig[] => { const s: BarSig[] = new Array(n).fill(null); s[0] = { atr: 1, long: { conf: 80, z: [[99, 100], [99, 100], [99, 100]] } }; return s; };
describe("simulator options", () => {
  const base = { zone: 1 as const, k: 1, tpR: 2, exit: 0 as const, costFrac: 0 };
  it("close-in-zone entry never stops out on the entry candle", () => {
    const c = [bar(0, 101, 101, 101, 101), bar(1, 101, 101, 97, 99.5), bar(2, 99.5, 106, 99, 105)]; // dips through the stop (98) but closes in zone
    const t = simulate(c, sig(3), { ...base, onClose: true }); expect(t[0].entry).toBe(99.5); expect(t[0].outcome).toBe("tp1"); expect(t[0].r).toBeCloseTo(2);
    const touch = simulate(c, sig(3), { ...base, onClose: false }); expect(touch[0].outcome).toBe("stop");
  });
  it("partial: half at 2R then break-even", () => {
    const c = [bar(0, 101, 101, 101, 101), bar(1, 101, 101, 99.4, 99.5), bar(2, 99.5, 103.1, 99.6, 103), bar(3, 103, 103, 99, 99)]; // R=1.5, 2R=102.5, back to BE
    const t = simulate(c, sig(4), { ...base, exit: 2, onClose: true }); expect(t[0].outcome).toBe("be"); expect(t[0].r).toBeCloseTo(1);
    const t3 = simulate(c, sig(4), { ...base, exit: 1, onClose: true }); expect(t3[0].outcome).toBe("open"); expect(t3[0].r).toBeCloseTo(1 - 0.5 / 3);
  });
  it("costs are charged in R and stats add up", () => {
    const c = [bar(0, 101, 101, 101, 101), bar(1, 101, 101, 99.4, 99.5), bar(2, 99.5, 103, 99.6, 103)];
    const t = simulate(c, sig(3), { ...base, onClose: true, costFrac: 0.001 }); expect(t[0].r).toBeCloseTo(2 - (0.001 * 99.5) / 1.5);
    expect(stats(t).n).toBe(1);
  });
});
