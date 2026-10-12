import "fake-indexeddb/auto";
import { computePnl, computeR, db, exportJson, importJson } from "../src/journal/db";
import { binanceCsvToTrades, fillsToTrades } from "../src/journal/imports";
import { stats } from "../src/journal/stats";

describe("journal", () => {
  it("persists trades in IndexedDB and round-trips JSON backup", async () => {
    await db.put({ id: "a", createdAt: 1, exchange: "bulk", symbol: "BTC-USD", side: "long", entry: 100, exit: 110, stop: 95, size: 1, pnl: 10, r: 2, signals: ["RSI"], confidence: 71, source: "manual", settings: { swingLen: 3 } as any });
    const j = await exportJson(); await db.clear(); expect(await db.trades()).toHaveLength(0);
    expect(await importJson(j)).toBe(1); expect((await db.trades())[0].settings).toEqual({ swingLen: 3 });
    await expect(importJson('{"foo":1}')).rejects.toThrow();
  });
  it("R and P&L", () => { expect(computeR({ side: "short", entry: 100, stop: 105, exit: 90 })).toBe(2); expect(computePnl({ side: "long", entry: 10, exit: 12, size: 3 })).toBe(6); });
  it("fills → round-trip trades incl. flip", () => {
    const t = fillsToTrades([{ time: 1, symbol: "BTC", side: "buy", px: 100, sz: 1 }, { time: 2, symbol: "BTC", side: "sell", px: 110, sz: 2 }, { time: 3, symbol: "BTC", side: "buy", px: 105, sz: 1 }], "hyperliquid");
    expect(t.map((x) => [x.side, x.entry, x.exit, x.pnl])).toEqual([["long", 100, 110, 10], ["short", 110, 105, 5]]);
  });
  it("parses Binance futures CSV", () => {
    const csv = 'Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit\n2026-10-01 10:00:00,BTCUSDT,BUY,100,2,200,0.1,0\n2026-10-01 12:00:00,BTCUSDT,SELL,90,2,180,0.1,-20\n';
    const t = binanceCsvToTrades(csv); expect(t).toHaveLength(1); expect(t[0]).toMatchObject({ side: "long", pnl: -20, source: "binance-csv" });
    expect(() => binanceCsvToTrades("a,b\n1,2")).toThrow();
  });
  it("stats by signal / band / emotion / plan", () => {
    const s = stats([{ id: "1", createdAt: 0, exchange: "", symbol: "X", side: "long", entry: 1, size: 1, pnl: 5, r: 1, signals: ["RSI", "FVG"], confidence: 70, emotion: "calm", followedPlan: true, source: "manual" },
      { id: "2", createdAt: 0, exchange: "", symbol: "X", side: "long", entry: 1, size: 1, pnl: -5, r: -1, signals: ["RSI"], confidence: 40, emotion: "fomo", followedPlan: false, source: "manual" }]);
    expect(s.bySignal.find((r) => r.key === "RSI")).toMatchObject({ n: 2, winRate: 0.5, avgR: 0 });
    expect(s.byConfidence.map((r) => r.key).sort()).toEqual(["Below P50", "P65–79"]);
    expect(s.byPlan.find((r) => r.key === "followed plan")!.winRate).toBe(1);
  });
});
