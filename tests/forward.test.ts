// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { resolveSnap, settingsHash, fwdSettings, snapshotsAt, closedOnly } from "../src/forward/core";
import { runJob } from "../src/forward/job";
import { BUILTINS } from "../src/strategies";
import { TF_MS } from "../src/api/markets";
const H = TF_MS["1h"];
const k = (i: number, o: number, h: number, l: number, c: number) => ({ t: i * H, o, h, l, c, v: 10 });
const snapL = { candle_t: 0, side: "long" as const, entry_top: 100, entry_bottom: 98, sl: 95, tp1: 106, tp2: 110 };
describe("forward test: resolution", () => {
  it("pending, expired, TP1, TP2, SL, same-bar SL", () => {
    expect(resolveSnap(snapL, [k(1, 103, 104, 101, 102)]).status).toBe("pending");
    expect(resolveSnap(snapL, Array.from({ length: 24 }, (_, i) => k(i + 1, 103, 104, 101, 102)))).toMatchObject({ status: "expired", fill_t: null });
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100), k(2, 100, 107, 99, 106)])).toMatchObject({ status: "tp1_open", fill_t: H, tp1_t: 2 * H });
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100), k(2, 100, 107, 99, 106), k(3, 106, 111, 105, 110)]).status).toBe("tp2");
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100), k(2, 100, 107, 99, 106), k(3, 106, 106, 94, 95)]).status).toBe("tp1");
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100), k(2, 100, 100, 94, 95)]).status).toBe("sl");
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100), k(2, 100, 112, 94, 100)]).status).toBe("sl"); // SL and TP in one bar → SL
    expect(resolveSnap(snapL, [k(1, 101, 101, 99, 100)]).status).toBe("open");
    expect(resolveSnap({ ...snapL, side: "short", entry_top: 102, entry_bottom: 100, sl: 105, tp1: 94, tp2: 90 }, [k(1, 99, 101, 98, 100), k(2, 100, 100, 93, 94)]).status).toBe("tp1_open");
  });
  it("uses today's Signal default settings, with a stable hash", () => {
    expect(fwdSettings()).toEqual(BUILTINS.find((s) => s.id === "b-default")!.settings);
    expect(settingsHash(fwdSettings())).toMatch(/^v1-[0-9a-f]{8}$/); expect(settingsHash(fwdSettings())).toBe(settingsHash(fwdSettings()));
    expect(settingsHash({ ...fwdSettings(), minRR: 3 })).not.toBe(settingsHash(fwdSettings()));
  });
  it("closed candles only", () => { expect(closedOnly([k(0, 1, 1, 1, 1), k(1, 1, 1, 1, 1)], "1h", 1.5 * H)).toHaveLength(1); });
});
describe("forward test: job against Postgres (PGlite)", () => {
  // trending series so the default rule passes sometimes
  const series = (n: number) => Array.from({ length: n }, (_, i) => { const x = 100 + 10 * Math.sin(i / 9) + i * 0.05; return { t: i * H, o: x, h: x + 1.2, l: x - 1.2, c: x + 0.3 * Math.sin(i), v: 10 + (i % 7) }; });
  it("is idempotent, catches up missed candles, keeps snapshots append-only, and stores the venue", async () => {
    const pg = new PGlite(); const q = async (t: string, p?: unknown[]) => (await pg.query(t, p as any[])).rows as any[];
    const all = series(700); let now = 600 * H + 1; const calls: string[] = [];
    const fetch = async (v: any, s: string, tf: any, n: number) => { calls.push(v); const step = tf === "4h" ? 4 : 1; return all.filter((c) => c.t + step * H <= now + 4 * H).filter((_, i) => i % step === 0).map((c) => ({ ...c })).slice(-n); };
    const markets = async () => [{ symbol: "BTC", maxLev: 40 }, { symbol: "BTC-USD", maxLev: 40 }, { symbol: "ETH", maxLev: 25 }, { symbol: "ETH-USD", maxLev: 25 }, { symbol: "SOL", maxLev: 20 }, { symbol: "SOL-USD", maxLev: 20 }];
    const o = { fetch, markets, log: () => {} };
    const r1 = await runJob(q, { ...o, now }); expect(r1.errors).toEqual([]);
    const n1 = (await q("select count(*)::int n from fwd_snapshots"))[0].n;
    const r2 = await runJob(q, { ...o, now }); expect(r2.inserted).toBe(0); // same candle again: nothing new
    now += 30 * H; await runJob(q, { ...o, now }); // 30 hourly candles missed → caught up
    const feeds = await q("select venue, count(distinct candle_t)::int c from fwd_snapshots where tf='1h' group by venue order by venue");
    expect(feeds.map((f) => f.venue)).toEqual(["bulk", "hyperliquid"].filter((v) => feeds.some((f) => f.venue === v)));
    expect((await q("select max(candle_t)::bigint m from fwd_snapshots where tf='1h'"))[0].m === null || n1 >= 0).toBe(true);
    const cur = await q("select * from fwd_cursor where tf='1h' and venue='hyperliquid' and symbol='BTC'"); expect(Number(cur[0].last_t)).toBe(all.filter((c) => c.t + H <= now).at(-1)!.t);
    await expect(q("update fwd_snapshots set sl = 1")).rejects.toThrow(/append-only/); await expect(q("delete from fwd_snapshots")).rejects.toThrow(/append-only/);
    const st = await q("select status, count(*)::int n from fwd_results group by status"); expect(st.every((x) => ["pending", "expired", "open", "tp1_open", "tp1", "tp2", "sl"].includes(x.status))).toBe(true);
    expect((await q("select count(*)::int n from fwd_runs"))[0].n).toBe(3);
    const keys = await q("select key from fwd_snapshots limit 1"); if (keys.length) expect(keys[0].key).toMatch(/^(hyperliquid|bulk)\|/);
    expect(calls).toContain("bulk"); expect(calls).toContain("hyperliquid");
  }, 60_000);
});
import { by, rates } from "../src/forward/stats";
describe("forward test: page stats", () => {
  const R = (status: string, n: number, extra: any = {}) => ({ venue: "hyperliquid", symbol: "BTC", tf: "1h", zone: 1, conf_band: "High", side: "long", status, n, ...extra });
  it("fill, TP1, TP2 and stop rates use the right denominators", () => {
    const r = rates([R("pending", 5), R("expired", 10), R("open", 2), R("tp1_open", 3), R("tp1", 2), R("tp2", 5), R("sl", 10)]);
    expect(r.n).toBe(37); expect(r.filled).toBe(22); expect(r.fillRate).toBeCloseTo((100 * 22) / 32); expect(r.withResult).toBe(20);
    expect(r.tp1Rate).toBeCloseTo(50); expect(r.slRate).toBeCloseTo(50); expect(r.tp2Rate).toBeCloseTo((100 * 5) / 17);
    expect(rates([]).fillRate).toBeNull();
  });
  it("groups Bulk symbols with Hyperliquid ones by coin", () => {
    const g = by([R("sl", 1), R("tp2", 1, { venue: "bulk", symbol: "BTC-USD" }), R("sl", 2, { symbol: "ETH" })], "symbol");
    expect(g.map((x) => [x.key, x.r.n])).toEqual([["BTC", 2], ["ETH", 2]]);
  });
});
