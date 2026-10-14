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
