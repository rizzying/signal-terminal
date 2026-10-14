import { toCsv, csvFilename, CSV_COLS, outcome } from "../src/forward/csv.js";
it("forward CSV: one row per snapshot, all columns, WIB+UTC, outcomes", () => {
  const t = Date.parse("2026-10-14T01:00:00Z"), d = Date.parse("2026-10-14T05:00:00Z");
  const base = { venue: "hyperliquid", symbol: "BTC", tf: "1h", side: "long", zone: 2, conf_band: "Medium", conf_pct: 62, close_t: t, entry_bottom: 99, entry_top: 101, entry_mid: 100, sl: 98, tp1: 104, tp2: 106, settings_hash: "abc" };
  const csv = toCsv([{ ...base, status: "tp1_open", done_t: null, bars: 3 }, { ...base, status: "sl", done_t: d, bars: 4 }, { ...base, status: "pending", done_t: null, bars: 0, settings_hash: "=x,y" }]);
  const lines = csv.trim().split("\r\n"); expect(lines[0]).toBe(CSV_COLS.join(",")); expect(lines).toHaveLength(4);
  expect(lines[1]).toBe("2026-10-14 08:00 WIB,2026-10-14T01:00:00Z,hyperliquid,BTC,1h,long,2,99,101,98,104,106,2.00,62,Medium,abc,TP1,,,3");
  expect(lines[2].endsWith("SL,2026-10-14 12:00 WIB,2026-10-14T05:00:00Z,4")).toBe(true);
  expect(lines[3]).toContain('"=x,y",pending,,,');
  expect(outcome("open")).toBe("pending"); expect(outcome("expired")).toBe("expired");
  expect(csvFilename(Date.parse("2026-10-14T01:53:00Z"))).toBe("signal-forward-20261014-0853.csv");
});
