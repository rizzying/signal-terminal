// @vitest-environment node
import { hideRepeats, filterRows, score, breakdown, setups, progress, rNet, parseFilters, SMALL_N } from "../src/forward/view.js";
import { rateText } from "../src/ui/Forward";
import { PGlite } from "@electric-sql/pglite";
import { runJob } from "../src/forward/job";
import { fwdFeeds } from "../src/forward/core";
const H = 3.6e6;
const row = (o: any = {}) => ({ id: 1, version: "v3", venue: "bulk", symbol: "ETH-USD", tf: "1h", side: "long", zone: 3, candle_t: 0, close_t: H, entry_top: 2483.83, entry_bottom: 2463.565, entry_mid: 2473.7, sl: 2436.354, tp1: 2550, tp2: 2580, atr: 14, px: 2500, status: "pending", fill_t: null, done_t: null, bars: 0, conf_band: "High", conf_pct: 80, ...o });
describe("forward view", () => {
  it("hides the v3 repeat rows (same entry, stop drifted) but keeps a new row after the first resolves", () => {
    const rs = [row(), row({ id: 2, candle_t: H, close_t: 2 * H, sl: 2431.953 }), row({ id: 3, candle_t: 2 * H, close_t: 3 * H, sl: 2437.578 })];
    expect(hideRepeats(rs).map((r) => r.id)).toEqual([1]);
    expect(hideRepeats([row({ status: "sl", fill_t: 1, done_t: H / 2 }), row({ id: 2, candle_t: H })]).map((r) => r.id)).toEqual([1, 2]);
    expect(hideRepeats([row({ atr: null, version: "v1" }), row({ id: 2, candle_t: H, atr: null, version: "v1" })])).toHaveLength(2); // no ATR → untouched
  });
  it("scoreboard: win rate TP1+ vs SL, avg R after fees, expired %, small-sample flag", () => {
    const rs = [row({ status: "tp1" }), row({ status: "tp1_open" }), row({ status: "sl" }), row({ status: "expired" }), row({ status: "pending" }), row({ status: "open" })];
    const s = score(rs); expect(s).toMatchObject({ n: 6, resolved: 3, win: 2, loss: 1, waiting: 1, running: 1, expired: 1, filled: 4, small: true });
    expect(s.winRate).toBeCloseTo(2 / 3); expect(s.expiredPct).toBeCloseTo(1 / 5); expect(rNet(row({ status: "sl" }))!).toBeLessThan(-1);
    expect(rateText(2, 3)).toBe("2 of 3 · small sample"); expect(rateText(15, SMALL_N)).toBe("75% (15/20)"); expect(rateText(0, 0)).toBe("–");
    expect(breakdown(rs, "zone")[0]).toMatchObject({ key: "Z3", n: 6 });
  });
  it("filters (validated) and one card per snapshot with zones inside", () => {
    const f = parseFilters({ venue: "bulk", symbol: "ETH", tf: "1h", zone: "3", status: "waiting", from: "1970-01-01", side: "nope", to: "x" });
    expect(f).toMatchObject({ venue: "bulk", symbol: "ETH", tf: "1h", zone: "3", status: "waiting", from: "1970-01-01" }); expect(f.side).toBeUndefined(); expect(f.to).toBeUndefined();
    expect(filterRows([row(), row({ venue: "hyperliquid" }), row({ status: "sl" })], f)).toHaveLength(1);
    const c = setups([row({ zone: 2 }), row({ zone: 1 }), row({ zone: 3 }), row({ candle_t: H, close_t: 2 * H })]);
    expect(c).toHaveLength(2); expect(c[1].zones.map((z: any) => z.zone)).toEqual([1, 2, 3]);
  });
  it("live progress: distance in % and ATR, approaching vs moving away, bars left", () => {
    const s = { side: "long", tf: "1h", close_t: 0, px: 2500, atr: 14 } as any; const z = { entry_bottom: 2463.565, entry_top: 2483.83 };
    const p = progress(z, s, 2490, 3 * H + 1, undefined); expect(p.trend).toBe("approaching"); expect(p.gapAtr).toBeCloseTo((2490 - 2483.83) / 14); expect(p.barsLeft).toBe(21);
    expect(progress(z, s, 2510, H, undefined).trend).toBe("moving away"); expect(progress(z, s, 2470, H, undefined).inside).toBe(true);
  });
});
describe("v4 feeds + 15m catch-up on an hourly job", () => {
  it("all Bulk TRADING markets, plus HL where listed", () => {
    expect(fwdFeeds([{ symbol: "BTC-USD" }, { symbol: "LIT-USD" }], [{ symbol: "BTC" }, { symbol: "ETH" }])).toEqual([{ venue: "hyperliquid", symbol: "BTC" }, { venue: "bulk", symbol: "BTC-USD" }, { venue: "bulk", symbol: "LIT-USD" }]);
  });
  it("an hourly run processes the four 15m candles that closed since the last run", async () => {
    const pg = new PGlite(); const q = async (t: string, p?: unknown[]) => (await pg.query(t, p as any[])).rows as any[];
    const MS: Record<string, number> = { "15m": 9e5, "1h": H, "4h": 4 * H, "1d": 24 * H }; let now = 2000 * 9e5 + 1;
    const fetch = async (_v: any, _s: string, tf: string, n: number) => { const ms = MS[tf]; const end = Math.floor(now / ms); return Array.from({ length: n }, (_, k) => { const i = end - n + k; const x = 100 + 10 * Math.sin(i / 9); return { t: i * ms, o: x, h: x + 1.2, l: x - 1.2, c: x + 0.3, v: 10 }; }); };
    const markets = async (v: string) => (v === "bulk" ? [{ symbol: "BTC-USD", maxLev: 40 }] : [{ symbol: "BTC", maxLev: 40 }]);
    const logs: string[] = []; await runJob(q, { now, fetch, markets, log: (s) => logs.push(s) }); logs.length = 0; now += H; await runJob(q, { now, fetch, markets, log: (s) => logs.push(s) });
    expect(logs.find((l) => l.startsWith("bulk BTC-USD 15m"))).toMatch(/\(4 new candles\)/); expect(logs.find((l) => l.startsWith("hyperliquid BTC 1h"))).toMatch(/\(1 new candle\)/);
  }, 60_000);
});
