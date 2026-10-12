import { candles, listMarkets } from "../src/api/markets";
const res = (j: unknown) => Promise.resolve(new Response(JSON.stringify(j), { status: 200 }));
describe("market adapters", () => {
  it("hyperliquid markets skip delisted", async () => { const m = await listMarkets("hyperliquid", () => res({ universe: [{ name: "BTC", maxLeverage: 40 }, { name: "OLD", maxLeverage: 3, isDelisted: true }] })); expect(m.map((x) => x.symbol)).toEqual(["BTC"]); });
  it("bulk markets skip suspended", async () => { const m = await listMarkets("bulk", () => res([{ symbol: "BTC-USD", status: "TRADING", maxLeverage: 50 }, { symbol: "AAVE-USD", status: "SUSPENDED" }])); expect(m).toHaveLength(1); });
  it("binance klines parse", async () => { const c = await candles("binance", "BTCUSDT", "4h", 2, () => res([[1, "1", "2", "0.5", "1.5", "10"]])); expect(c[0]).toEqual({ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }); });
});
