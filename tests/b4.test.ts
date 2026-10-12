import { dashboard, maxDrawdown } from "../src/journal/dash";
import { isAddress, walletSnapshot } from "../src/api/wallets";
const T = (pnl: number, h: number, extra = {}) => ({ id: String(Math.random()), createdAt: Date.UTC(2026, 9, 12, h) - 7 * 3.6e6, exchange: "", symbol: "BTC", side: "long" as const, entry: 1, size: 1, pnl, signals: [], source: "manual" as const, ...extra });
describe("dashboard", () => {
  it("equity, drawdown, buckets in WIB", () => {
    const d = dashboard([T(10, 1), T(-15, 2), T(20, 13, { zone: 1 })]);
    expect(d.total).toBe(15); expect(d.maxDD).toBe(-15); expect(d.profitFactor).toBeCloseTo(2);
    expect(d.byHour.map((r) => r.key)).toEqual(["00–06", "12–18"]); expect(d.bySetup.find((r) => r.key === "long · Zone 1")!.winRate).toBe(1);
    expect(maxDrawdown([{ v: 5 }, { v: -5 }, { v: 3 }])).toBe(-10);
  });
});
describe("wallet watcher", () => {
  it("validates addresses", () => { expect(isAddress("hyperliquid", "0x" + "a".repeat(40))).toBe(true); expect(isAddress("hyperliquid", "0x123")).toBe(false); });
  it("parses HL positions", async () => {
    const f: any = async () => new Response(JSON.stringify({ marginSummary: { accountValue: "100" }, assetPositions: [{ position: { coin: "ETH", szi: "-2", entryPx: "3000", positionValue: "5800", unrealizedPnl: "200", leverage: { value: 5 }, liquidationPx: "3500" } }] }));
    const s = await walletSnapshot("hyperliquid", "0x" + "a".repeat(40), f);
    expect(s.positions[0]).toMatchObject({ symbol: "ETH", side: "short", size: 2, upnl: 200, liq: 3500 }); expect(s.equity).toBe(100);
  });
});
