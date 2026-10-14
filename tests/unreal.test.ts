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
