import { describe, it, expect } from "vitest";
import { unrealR, openWhatIfR } from "../src/forward/shadow.js";
describe("unrealized R (display only)", () => {
  it("long/short sign and sum", () => {
    const L = { id: 2, market: "ETHUSDT", side: "long", entry: 2496.29, sl: 2470.24 }, S = { id: 3, market: "SOLUSDT", side: "short", entry: 110, sl: 111 };
    expect(unrealR(L, 2496.29 + 26.05)).toBeCloseTo(1, 6); expect(unrealR(S, 111)).toBeCloseTo(-1, 6); expect(unrealR(L, NaN)).toBeNull();
    const o = openWhatIfR([{ id: "2", status: "open" }, { id: "3", status: "open" }, { id: "9", status: "tp" }], [L, S], { ETHUSDT: { px: 2522.34 }, SOLUSDT: { px: 111 } });
    expect(o.n).toBe(2); expect(o.r).toBeCloseTo(0, 6);
  });
});
import { excursion } from "../src/forward/shadow.js";
describe("MFE/MAE (research only)", () => {
  const t = { side: "long", entry: 100, sl: 90 }; const H = 3.6e6;
  const K = [{ t: 0, h: 200, l: 50 }, { t: H, h: 110, l: 95 }, { t: 2 * H, h: 130, l: 70 }];
  it("skips the fill candle, includes exit candle, stops at exit", () => { const e = excursion(t, K, H, 2 * H); expect(e.mfe).toBeCloseTo(1); expect(e.mae).toBeCloseTo(-0.5); });
  it("open uses candles to now plus live", () => { const e = excursion(t, K, H, null, 135); expect(e.mfe).toBeCloseTo(3.5); expect(e.mae).toBeCloseTo(-3); });
  it("short + unfilled", () => { expect(excursion({ side: "short", entry: 100, sl: 110 }, K, H, null).mfe).toBeCloseTo(3); expect(excursion(t, K, null, null).mfe).toBeNull(); });
});
import { mergeExc } from "../src/forward/shadow.js";
describe("MFE/MAE never shrink (v3.1.7 regression, F-2)", () => {
  // F-2: long 2496.29, SL 2470.24; fill candle 16:00 WIB skipped; closed 17:00/18:00 highs 2507.52; forming 19:00 candle high 2521.42
  const t = { side: "long", entry: 2496.29, sl: 2470.24, risk: 26.05 }; const H = 3.6e6, f0 = 16 * H;
  const K = [{ t: f0, h: 2509.2, l: 2495.11 }, { t: f0 + H, h: 2507.52, l: 2479.31 }, { t: f0 + 2 * H, h: 2507.52, l: 2500.41 }];
  const forming = { t: f0 + 3 * H, h: 2521.42, l: 2481 };
  it("uses the forming candle high/low, so a lower live price can't shrink best", () => {
    const a = excursion(t, K, f0 + H, null, { ...forming, h: 2516.1 }); // earlier load: forming high so far 2516.10 (+0.76R)
    const b = excursion(t, K, f0 + H, null, forming); // later load: price fell back but the candle's high stays
    expect(a.mfe).toBeCloseTo(0.7605, 3); expect(b.mfe).toBeGreaterThanOrEqual(a.mfe!); expect(b.mfe).toBeCloseTo(0.9647, 3);
    expect(excursion(t, K, f0 + H, null, 2486.02).mfe).toBeCloseTo(0.4311, 3); // legacy last-price path = the old shrinking behaviour
  });
  it("ignores a forming candle that duplicates a closed one or predates the fill", () => {
    expect(excursion(t, K, f0 + H, null, { t: f0 + 2 * H, h: 9999, l: 1 }).mfe).toBeCloseTo(0.4311, 3);
    expect(excursion(t, K, f0 + H, null, { t: f0, h: 9999, l: 1 }).mfe).toBeCloseTo(0.4311, 3);
  });
  it("max-merges persisted running values", () => {
    expect(mergeExc({ mfe_r: 0.76, mae_r: -0.5 }, { mfe: 0.43, mae: -0.65 })).toEqual({ mfe: 0.76, mae: -0.65 });
    expect(mergeExc({ mfe_r: null, mae_r: null }, { mfe: 0.43, mae: -0.65 })).toEqual({ mfe: 0.43, mae: -0.65 });
    expect(mergeExc({}, { mfe: null, mae: null })).toEqual({ mfe: null, mae: null });
  });
});
