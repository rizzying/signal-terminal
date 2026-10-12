import { candles, listMarkets } from "../src/api/markets";
const res = (j: unknown) => Promise.resolve(new Response(JSON.stringify(j), { status: 200 }));
describe("market adapters", () => {
  it("hyperliquid markets skip delisted", async () => { const m = await listMarkets("hyperliquid", () => res({ universe: [{ name: "BTC", maxLeverage: 40 }, { name: "OLD", maxLeverage: 3, isDelisted: true }] })); expect(m.map((x) => x.symbol)).toEqual(["BTC"]); });
  it("bulk markets skip suspended", async () => { const m = await listMarkets("bulk", () => res([{ symbol: "BTC-USD", status: "TRADING", maxLeverage: 50 }, { symbol: "AAVE-USD", status: "SUSPENDED" }])); expect(m).toHaveLength(1); });
  it("binance klines parse", async () => { const c = await candles("binance", "BTCUSDT", "4h", 2, () => res([[1, "1", "2", "0.5", "1.5", "10"]])); expect(c[0]).toEqual({ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }); });
});
import { topOfBook } from "../src/api/markets";
it("top of book: HL, Bulk, Binance", async () => {
  const hl = await topOfBook("hyperliquid", "BTC", () => res({ levels: [[{ px: "100" }], [{ px: "100.5" }]] })); expect(hl.spread).toBeCloseTo(0.5);
  const bu = await topOfBook("bulk", "BTC-USD", () => res({ levels: [[{ px: 99 }], [{ px: 101 }]] })); expect(bu.spreadPct).toBeCloseTo(0.02);
  const bn = await topOfBook("binance", "BTCUSDT", () => res({ bidPrice: "1", askPrice: "1.01" })); expect(bn.ask).toBe(1.01);
});
