import { backtest } from "../src/engine/backtest";
import { DEFAULTS, sanitize } from "../src/engine/settings";
import type { Candle } from "../src/engine/indicators";
const mk = (n: number, f: (i: number) => number): Candle[] => Array.from({ length: n }, (_, i) => { const x = f(i); return { t: i * 3.6e6, o: x, h: x * 1.006, l: x * 0.994, c: x * 1.001, v: 10 + (i % 7) }; });
describe("backtest", () => {
  const c = mk(700, (i) => 100 + 0.05 * i + 5 * Math.sin(i / 6));
  const r = backtest({ candles: c, startIdx: 300, settings: sanitize({ ...DEFAULTS, minOthers: 1, minRR: 1 }), zone: 1, margin: 1000, feePct: 0.045, spreadPct: 0.02 });
  it("one position at a time, ordered, no overlap", () => {
    for (let k = 1; k < r.trades.length; k++) expect(r.trades[k].entryT).toBeGreaterThanOrEqual(r.trades[k - 1].exitT);
    expect(r.wins + r.losses).toBe(r.trades.length); expect(r.equity).toHaveLength(400);
  });
  it("no lookahead: future bars don't change earlier trades", () => {
    const c2 = [...c.slice(0, 600), ...mk(100, () => 1)];
    const r2 = backtest({ candles: c2, startIdx: 300, settings: sanitize({ ...DEFAULTS, minOthers: 1, minRR: 1 }), zone: 1, margin: 1000, feePct: 0.045, spreadPct: 0.02 });
    const before = (x: typeof r) => x.trades.filter((t) => t.exitT < 599 * 3.6e6).map((t) => [t.entryT, t.exitT, t.pnl]);
    expect(before(r2)).toEqual(before(r));
  });
  it("fees reduce returns; benchmark is buy and hold", () => {
    const free = backtest({ candles: c, startIdx: 300, settings: sanitize({ ...DEFAULTS, minOthers: 1, minRR: 1 }), zone: 1, margin: 1000, feePct: 0, spreadPct: 0 });
    if (r.trades.length) expect(free.final).toBeGreaterThan(r.final);
    expect(r.holdReturn).toBeCloseTo(100 * ((c[699].c / c[300].o) * (1 - 0.00045) ** 2 - 1), 6);
    expect(r.maxDD).toBeGreaterThanOrEqual(0);
  });
});
