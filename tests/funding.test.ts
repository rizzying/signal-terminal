import { baseAsset, bestSpread, fetchFunding, to8h, toApr } from "../src/api/funding";
describe("funding", () => {
  it("base asset", () => { expect(["BTC", "BTC-USD", "BTCUSDT", "ETH-PERP", "SOL_USDT"].map(baseAsset)).toEqual(["BTC", "BTC", "BTC", "ETH", "SOL"]); });
  it("normalizes to 8h and APR", () => { const r = { venue: "x", symbol: "x", rate: 0.0000125, intervalH: 1 }; expect(to8h(r)).toBeCloseTo(0.0001); expect(toApr(r)).toBeCloseTo(0.1095); });
  it("best spread shorts highest, longs lowest", () => {
    const s = bestSpread([{ venue: "A", symbol: "", rate: 0.0001, intervalH: 8 }, { venue: "B", symbol: "", rate: -0.00001, intervalH: 1 }])!;
    expect(s.shortOn.venue).toBe("A"); expect(s.longOn.venue).toBe("B"); expect(s.aprSpread).toBeCloseTo(0.1095 + 0.0876);
  });
  it("reads Binance via HL feed and reports failures", async () => {
    const f: any = async (url: string, init?: any) => {
      if (url.includes("fapi.binance")) return new Response("{}", { status: 451 });
      if (url.includes("hyperliquid") && init.body.includes("predictedFundings")) return new Response(JSON.stringify([["BTC", [["BinPerp", { fundingRate: "0.00008", fundingIntervalHours: 8, nextFundingTime: 1 }]]]]));
      throw new Error("blocked");
    };
    const r = await fetchFunding("BTCUSDT", f);
    expect(r.rows.find((x) => x.venue === "Binance")).toMatchObject({ rate: 0.00008, via: "next rate, via Hyperliquid feed" });
    expect(r.failed.length).toBeGreaterThan(3);
  });
});
