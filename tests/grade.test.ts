// @vitest-environment node
// @ts-ignore node types are not in the app tsconfig
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { paperJob, type Stmt } from "../src/forward/paperJob";
import { gradeJob, gradeTrade, parsePlaced, type RangeFetch } from "../src/forward/grade";
import { splitBoards } from "../src/forward/split.js";
import { scoreboards } from "../src/forward/paper.js";
import { BOOK_HASH } from "../src/forward/books.js";

const H = 3.6e6;
const series = Array.from({ length: 700 }, (_, i) => { const b = 100 + 10 * Math.sin(i / 15) + i * 0.02; return { t: i * H, o: b, h: b + 1.2, l: b - 1.2, c: b + 0.3 * Math.sin(i), v: 100 + (i % 7) * 30 }; });
// The paper fixture feeds 1H candles to every timeframe, so the range fetch ignores `from` and the interval the same way.
const range: RangeFetch = async (_m, _i, _from, to) => series.filter((k) => k.t <= to);
const db = new PGlite(); const q = async (t: string, p?: unknown[]) => (await db.query(t, p as any[])).rows as any[];
const tx = async (ss: Stmt[]) => { await db.transaction(async (t) => { for (const x of ss) await t.query(x.text, x.params as any[]); }); };
const grades = async () => q(`select key, verdict, strength, facts, graded_at from fwd_grades order by key`);
const count = async () => (await q(`select count(*)::int n from fwd_grades`))[0].n;

beforeAll(async () => {
  for (const now of [600 * H, 690 * H]) await paperJob(q, { now, klines: async (_m, n) => series.filter((x) => x.t + H <= now).slice(-n), funding: async () => ({ rows: [], src: "hl-proxy" }), log: () => {}, tx });
}, 60_000);

it("grades every v2 trade ok from its placement replay, and a second run inserts nothing", async () => {
  const T = await q(`select * from fwd_trades`);
  const cur = await q(`select strategy, market, last_t from fwd_trader order by strategy, market`);
  expect(new Set(T.map((t) => t.strategy.split("-")[1]))).toEqual(new Set(["15m", "1h", "4h"]));
  const a = await gradeJob(q, { klines: range });
  expect(await q(`select * from fwd_trades`)).toEqual(T);
  expect(await q(`select strategy, market, last_t from fwd_trader order by strategy, market`)).toEqual(cur);
  expect(a).toEqual({ graded: T.length, unknown: 0, errors: [] });
  const g = await grades();
  for (const r of g) { expect(r.verdict).toBe("ok"); expect(["Strong", "OK", "Weak"]).toContain(r.strength); expect(r.facts).toBeNull(); }
  const b = await gradeJob(q, { klines: range });
  expect(b).toEqual({ graded: 0, unknown: 0, errors: [] });
  expect(await grades()).toEqual(g);
  const split = splitBoards(T, g);
  for (const card of scoreboards(T)) {
    expect(split[card.id].strength.reduce((n: number, x: any) => n + x.n, 0)).toBe(card.n);
    expect(split[card.id].strength.at(-1).n).toBe(0);
    expect(split[card.id].unknown).toEqual([]);
  }
});

it("a tampered entry is mismatch, a moved order is moved, a missing confidence is no-conf", async () => {
  const [a, b, c] = (await q(`select key, entry, conf from fwd_trades order by key limit 3`));
  await q(`delete from fwd_grades`);
  await q(`update fwd_trades set entry = entry + 0.01 where key = $1`, [a.key]);
  await q(`update fwd_trades set replaced = 2 where key = $1`, [b.key]);
  await q(`update fwd_trades set conf = null where key = $1`, [c.key]);
  const r = await gradeJob(q, { klines: range });
  expect(r.unknown).toBe(3); expect(r.errors).toEqual([]);
  const g = Object.fromEntries((await grades()).map((x) => [x.key, x]));
  expect(g[a.key]).toMatchObject({ verdict: "mismatch", strength: null, facts: { fields: ["entry"], replay: { entry: a.entry } } });
  expect(g[b.key]).toMatchObject({ verdict: "moved", strength: null, facts: { replaced: 2 } });
  expect(g[c.key]).toMatchObject({ verdict: "no-conf", strength: null });
  await q(`update fwd_trades set entry = $2 where key = $1`, [a.key, a.entry]);
  await q(`update fwd_trades set replaced = 0 where key = $1`, [b.key]);
  await q(`update fwd_trades set conf = $2 where key = $1`, [c.key, c.conf]);
});

it("an unknown rules hash is rules, and a short candle history is candles with the count", async () => {
  const t = parsePlaced((await q(`select * from fwd_trades where strategy = 'bn-1h-z2-v2' limit 1`))[0]);
  expect(gradeTrade({ ...t, rulesHash: "deadbeef" }, series)).toEqual({ verdict: "rules", facts: { hash: "deadbeef", want: BOOK_HASH["bn-1h-z2-v2"] } });
  expect(gradeTrade(t, series.filter((k) => k.t > t.placedT - 151 * H))).toEqual({ verdict: "candles", facts: { got: 150 } });
  expect(gradeTrade(t, series.filter((k) => k.t !== t.placedT - H))).toEqual({ verdict: "candles", facts: { got: 399 } });
});

it("a throwing kline fetch writes no row and reports the error", async () => {
  await q(`delete from fwd_grades`);
  const r = await gradeJob(q, { klines: async () => { throw new Error("418"); } });
  expect(r.graded).toBe(0); expect(r.errors.length).toBeGreaterThan(0); expect(r.errors.every((e) => e.endsWith(": 418"))).toBe(true);
  expect(await count()).toBe(0);
});

it("a hanging kline fetch is aborted at the budget and writes nothing", async () => {
  await q(`delete from fwd_grades`); let aborted = 0;
  const hang: RangeFetch = (_m, _i, _f, _t, signal) => new Promise((_, rej) => signal!.addEventListener("abort", () => { aborted++; rej(signal!.reason); }));
  const r = await gradeJob(q, { klines: hang, budgetMs: 50 });
  expect(aborted).toBeGreaterThan(0); expect(r.graded).toBe(0); expect(r.errors.every((e) => /budget/.test(e))).toBe(true);
  expect(await count()).toBe(0);
});

it("the hourly script loads the grader only after the run row, and keeps its exit rule", () => {
  const src = readFileSync("scripts/forward.ts", "utf8");
  expect(src).not.toMatch(/^import\b[^\n]*forward\/grade/m);
  const run = src.indexOf("insert into fwd_runs"), dyn = src.indexOf(`await import("../src/forward/grade")`), exit = src.indexOf("if (p.errors.length >= 3) process.exit(1)");
  expect(run).toBeGreaterThan(-1);
  expect(dyn).toBeGreaterThan(run);
  expect(exit).toBeGreaterThan(dyn);
});
