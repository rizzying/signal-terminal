// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { step, BOOKS, tradeKey, type State, type Plan } from "../src/forward/trader";
import { paperJob, barsDue, type Stmt } from "../src/forward/paperJob";
import { ensurePaperSchema } from "../src/forward/db";
import { scoreboards } from "../src/forward/paper.js";

const H = 3.6e6, M15 = 15 * 60 * 1000, M = "BTCUSDT";
const k = (i: number, o: number, h: number, l: number, c: number, bar = H) => ({ t: i * bar, o, h, l, c, v: 1 });
const L: Plan = { side: "long", entry: 100, sl: 98, tp: 104, atr: 2, conf: 60 };
const flat: State = { order: null, pos: null };

it("two scorecards on the same coin keep separate orders", () => {
  const z2 = step(flat, k(0, 101, 102, 100.5, 101), [L], M);
  const z1 = step(flat, k(0, 101, 102, 100.5, 101), [{ ...L, entry: 99, sl: 97, tp: 105 }], M);
  expect(z2.state.order?.entry).toBe(100);
  expect(z1.state.order?.entry).toBe(99);
  const moved = step(z2.state, k(1, 101, 102, 100.5, 101), [{ ...L, entry: 90, sl: 80, tp: 120 }], M);
  expect(moved.state.order).toMatchObject({ entry: 100, sl: 98, tp: 104 });
  expect(moved.events.map((e) => e.kind)).toEqual([]);
  expect(z1.state.order?.entry).toBe(99);
  expect(tradeKey({ market: M, placed_t: z2.state.order!.placed_t }, "bn-1h-z2-v2")).toBe(`bn-1h-z2-v2|${M}|${H}`);
  expect(tradeKey({ market: M, placed_t: z1.state.order!.placed_t }, "bn-15m-z1-v2")).not.toBe(tradeKey({ market: M, placed_t: z2.state.order!.placed_t }, "bn-1h-z2-v2"));
});

it("15m close is 15 minutes, and barsDue keeps every candle since the cursor, oldest first", () => {
  const r = step(flat, k(0, 101, 102, 100.5, 101, M15), [L], M, undefined, M15);
  expect(r.state.order?.placed_t).toBe(M15);
  expect(r.events[0].t).toBe(M15);
  const closed = [0, 1, 2, 3, 4].map((i) => k(i, 1, 1, 1, 1, M15));
  expect(barsDue(closed, null, 10).map((x) => x.t)).toEqual([4 * M15]);
  expect(barsDue(closed, M15, 10).map((x) => x.t)).toEqual([2, 3, 4].map((i) => i * M15));
  expect(barsDue(closed, 0, 2).map((x) => x.t)).toEqual([M15, 2 * M15]);
});

it("scorecards report headline first and do not blend v1 into v2", () => {
  const boards = scoreboards([
    { strategy: "bn-1h-z2-v1", status: "closed", exit_reason: "tp", r_net: 3, exit_t: 1 },
    { strategy: "bn-4h-z3-v2", status: "closed", exit_reason: "sl", r_net: -1, exit_t: 2 },
    { strategy: "bn-1h-z2-v2", status: "closed", exit_reason: "tp", r_net: 1, exit_t: 3 },
  ]);
  expect(boards[0].id).toBe("bn-1h-z2-v2");
  expect(boards[0].headline).toBe(true);
  expect(boards.at(-1)!.legacy).toBe(true);
  expect(boards[0].n).toBe(1);
  expect(boards.at(-1)!.n).toBe(1);
  expect(boards[0].avgR).toBeCloseTo(1);
  expect(boards.at(-1)!.avgR).toBeCloseTo(3);
  expect(new Set(BOOKS.map((b) => b.strategy)).size).toBe(9);
});

const mk = () => {
  const db = new PGlite();
  const q = async (t: string, p?: unknown[]) => (await db.query(t, p as any[])).rows as any[];
  const tx = async (ss: Stmt[]) => { await db.transaction(async (t) => { for (const x of ss) await t.query(x.text, x.params as any[]); }); };
  return { q, tx };
};

it("migration tags unversioned rows as v1 and leaves v1 and v2 rows alone", async () => {
  const { q } = mk();
  await ensurePaperSchema(q);
  const ins = async (key: string, strategy: string) => q(`insert into fwd_trades (key, strategy, rules_hash, market, side, status, placed_t, entry, sl, tp, risk) values ($1,$2,'b81ceeeb','BTCUSDT','long','closed',1,100,98,106,2)`, [key, strategy]);
  await ins("old", "bn-1h-z2");
  await ins("v1", "bn-1h-z2-v1");
  await ins("v2", "bn-15m-z1-v2");
  await q(`insert into fwd_events (strategy, market, kind, t, data) values ('bn-1h-z2','BTCUSDT','place',1,'{}')`);
  await q(`insert into fwd_trader (strategy, market, last_t) values ('bn-1h-z2','BTCUSDT',5)`);
  const before = await q(`select key, strategy, entry, updated_at from fwd_trades order by key`);
  await ensurePaperSchema(q);
  const after = await q(`select key, strategy, entry, updated_at from fwd_trades order by key`);
  expect(after.find((r) => r.key === "old").strategy).toBe("bn-1h-z2-v1");
  expect(after.find((r) => r.key === "v1")).toMatchObject({ strategy: "bn-1h-z2-v1", entry: 100 });
  expect(after.find((r) => r.key === "v2").strategy).toBe("bn-15m-z1-v2");
  expect(String(after.find((r) => r.key === "v1").updated_at)).toBe(String(before.find((r) => r.key === "v1").updated_at));
  expect(String(after.find((r) => r.key === "v2").updated_at)).toBe(String(before.find((r) => r.key === "v2").updated_at));
  expect((await q(`select strategy from fwd_events`))[0].strategy).toBe("bn-1h-z2-v1");
  expect((await q(`select strategy from fwd_trader`))[0].strategy).toBe("bn-1h-z2-v1");
  await ensurePaperSchema(q);
  expect((await q(`select count(*)::int n from fwd_trades`))[0].n).toBe(3);
  expect((await q(`select count(*)::int n from fwd_trades where strategy = 'bn-1h-z2'`))[0].n).toBe(0);
});

it("the hourly job steps every closed 15m candle since the cursor and does not skip a gap", async () => {
  const { q, tx } = mk();
  const book = BOOKS.find((b) => b.strategy === "bn-15m-z1-v2")!;
  const c = Array.from({ length: 80 }, (_, i) => ({ t: i * M15, o: 100, h: 100.4, l: 99.8, c: 100.1, v: 10 }));
  const kl = async (_m: string, n: number, interval?: string) => {
    if (interval !== "15m") return [];
    return c.filter((x) => x.t + M15 <= now).slice(-n);
  };
  let now = 50 * M15;
  const a = await paperJob(q, { now, klines: kl, funding: async () => ({ rows: [], src: "hl-proxy" }), log: () => {}, tx, books: [book] });
  expect(a.errors).toEqual([]);
  const freeze = Number((await q(`select last_t from fwd_trader where strategy = $1 and market = $2`, [book.strategy, M]))[0].last_t);
  expect(freeze).toBe(49 * M15);
  now = 56 * M15;
  const b = await paperJob(q, { now, klines: kl, funding: async () => ({ rows: [], src: "hl-proxy" }), log: () => {}, tx, books: [book] });
  expect(b.errors).toEqual([]);
  const cur = Number((await q(`select last_t from fwd_trader where strategy = $1 and market = $2`, [book.strategy, M]))[0].last_t);
  expect(cur - freeze).toBe(6 * M15);
  expect((await q(`select kind from fwd_events where kind = 'replace'`))).toEqual([]);
  await q(`update fwd_trader set last_t = $1 where strategy = $2`, [5 * M15, book.strategy]);
  const gapKl = async () => c.filter((x) => x.t >= 30 * M15 && x.t + M15 <= now);
  const g = await paperJob(q, { now, klines: gapKl, funding: async () => ({ rows: [], src: "hl-proxy" }), log: () => {}, tx, books: [book] });
  expect(g.errors.some((e) => e.includes("candle gap"))).toBe(true);
  expect(Number((await q(`select last_t from fwd_trader where strategy = $1 and market = $2`, [book.strategy, M]))[0].last_t)).toBe(5 * M15);
});
