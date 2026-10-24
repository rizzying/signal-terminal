// @vitest-environment node
// @ts-ignore node types are not in the app tsconfig
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { step, settle, tradesThrough, buffer, rulesHash, SPEC, STRATEGY, LEGACY_SPEC, BOOKS, type State, type Plan, type Trade } from "../src/forward/trader";
import { BOOK_HASH } from "../src/forward/books.js";
import { paperJob } from "../src/forward/paperJob";
import { meanCI, maxDdR, scorecard, scoreboards, combinedBoard, COMBINED_ID, verdict, tCrit, filterTrades, tradeCounts, parseTradeFilters, tradesCsv, today, parseTradeId, tradeId } from "../src/forward/paper.js";
import { wibDay } from "../src/forward/trader";
import { wibRange, type Stmt } from "../src/forward/paperJob";
const H = 3.6e6, M = "BTCUSDT";
const k = (i: number, o: number, h: number, l: number, c: number) => ({ t: i * H, o, h, l, c, v: 1 });
const L: Plan = { side: "long", entry: 100, sl: 98, tp: 104, atr: 2, conf: 60 };
const flat: State = { order: null, pos: null };
const run = (st: State, bars: [ReturnType<typeof k>, Plan[]][]) => { const ev: any[] = []; const cl: Trade[] = []; for (const [b, p] of bars) { const r = step(st, b, p, M); st = r.state; ev.push(...r.events); cl.push(...r.closed); } return { st, ev, cl }; };

it("order lifecycle: place → fill → TP; one trade; no new order while the position is open", () => {
  const r = run(flat, [[k(0, 101, 102, 100.5, 101), [L]], [k(1, 101, 101, 99.9, 100.5), [L]], [k(2, 100.5, 101, 100.2, 101), [{ ...L, side: "short", entry: 103 }]], [k(3, 101, 104.5, 100.5, 104), [L]]]);
  expect(r.ev.map((e) => e.kind)).toEqual(["place", "fill", "close", "place"]);
  expect(r.cl).toHaveLength(1); expect(r.cl[0].exit_reason).toBe("tp"); expect(r.cl[0].r_gross).toBeCloseTo(2);
  expect(r.cl[0].r_net!).toBeLessThan(2); // maker fees cost something
  expect(r.st.order?.placed_t).toBe(4 * H); // re-armed only after the close
});
it("locked order: setup moves and setup-gone do not change the price or cancel; a new order waits until expiry", () => {
  let r = run(flat, [[k(0, 102, 103, 101, 102), [L]], [k(1, 102, 103, 101, 102), [{ ...L, entry: 100.5, sl: 98.5, tp: 110 }]], [k(2, 102, 103, 101, 102), []]]);
  expect(r.ev.map((e) => e.kind)).toEqual(["place"]);
  expect(r.st.order).toMatchObject({ entry: 100, sl: 98, tp: 104, replaced: 0, placed_t: H });
  expect(r.ev.some((e) => e.kind === "replace" || e.kind === "cancel")).toBe(false);
  const bars: [ReturnType<typeof k>, Plan[]][] = [[k(0, 102, 103, 101, 102), [L]]];
  for (let i = 1; i <= 24; i++) bars.push([k(i, 102, 103, 101, 102), [{ ...L, entry: 90 }]]);
  r = run(flat, bars.slice(0, 24));
  expect(r.st.order).toMatchObject({ entry: 100, placed_t: H });
  expect(r.ev.filter((e) => e.kind === "place")).toHaveLength(1);
  r = run(r.st, [bars[24]]);
  expect(r.ev.map((e) => e.kind)).toEqual(["expire", "place"]);
  expect(r.cl[0].status).toBe("expired");
  expect(r.st.order).toMatchObject({ entry: 90, placed_t: 25 * H });
});
it("trade-through fill: a touch (or within the buffer) is not a fill; through by max(1 tick, 0.02%) is", () => {
  expect(buffer(100, M)).toBeCloseTo(0.02); expect(buffer(10, M)).toBeCloseTo(0.01);
  expect(tradesThrough(k(1, 101, 101, 100, 100.5), "long", 100, 0.02)).toBe(false);
  expect(tradesThrough(k(1, 101, 101, 99.99, 100.5), "long", 100, 0.02)).toBe(false);
  expect(tradesThrough(k(1, 101, 101, 99.98, 100.5), "long", 100, 0.02)).toBe(true);
  expect(tradesThrough(k(1, 99, 100.02, 99, 99.5), "short", 100, 0.02)).toBe(true);
  const r = run(flat, [[k(0, 101, 102, 100.5, 101), [L]], [k(1, 101, 101, 100, 100.5), [L]]]); expect(r.st.order).not.toBeNull(); expect(r.st.pos).toBeNull();
});
it("stop and target in the same candle = stop, with taker fee + spread + stop slippage; a stop in the fill candle also counts", () => {
  let r = run(flat, [[k(0, 101, 102, 100.5, 101), [L]], [k(1, 101, 101, 99.9, 100.5), [L]], [k(2, 100, 105, 97, 101), [L]]]);
  const t = r.cl[0]; expect(t.exit_reason).toBe("sl"); expect(t.exit_px!).toBeLessThan(98); expect(t.r_net!).toBeLessThan(-1.05);
  r = run(flat, [[k(0, 101, 102, 100.5, 101), [L]], [k(1, 100, 101, 97.5, 99), [L]]]); expect(r.ev.map((e) => e.kind)).toEqual(["place", "fill", "close", "place"]); expect(r.cl[0].exit_reason).toBe("sl");
  // gap through the stop exits at the open
  r = run(flat, [[k(0, 101, 102, 100.5, 101), [L]], [k(1, 101, 101, 99.9, 100.5), [L]], [k(2, 96, 97, 95, 96), [L]]]); expect(r.cl[0].exit_px!).toBeLessThan(96);
});
it("funding: longs pay positive rates for hours held, shorts receive", () => {
  const p: Trade = { market: M, side: "long", status: "open", placed_t: 0, entry: 100, sl: 98, tp: 104, risk: 2, conf: 1, replaced: 0, fill_t: 10, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null };
  const f = { rows: [{ t: 5, rate: 0.01 }, { t: 20, rate: 0.001 }, { t: 30, rate: 0.001 }, { t: 99, rate: 0.5 }], src: "hl-proxy" };
  const a = settle(p, 104, "tp", 40, f); expect(a.funding_r).toBeCloseTo(0.1); expect(a.funding_src).toBe("hl-proxy");
  expect(settle({ ...p, side: "short", tp: 96 }, 96, "tp", 40, f).funding_r).toBeCloseTo(-0.1);
});
it("stats: expectancy with a t 95% CI, profit factor, max drawdown, fill rate, win rate, and the pre-set kill/promote rules", () => {
  expect(tCrit(30)).toBeCloseTo(2.042, 3); expect(tCrit(29)).toBeGreaterThanOrEqual(2.042); expect(tCrit(500)).toBe(1.96);
  const ci = meanCI([1, -1, 2, -1]); expect(ci.mean).toBeCloseTo(0.25); expect(ci.hi! - ci.mean!).toBeCloseTo((3.182 * Math.sqrt(2.25)) / 2, 3);
  expect(maxDdR([2, -1, -1, -1, 3, -4])).toBe(-4);
  const T = [...[2, -1, -1, 2].map((r, i) => ({ status: "closed", exit_reason: r > 0 ? "tp" : "sl", r_net: r, exit_t: i, market: M, side: "long" })), { status: "cancelled", market: M, side: "long" }, { status: "expired", market: M, side: "short" }, { status: "open", market: M, side: "long" }];
  const s = scorecard(T); expect(s).toMatchObject({ n: 4, winRate: 0.5, pf: 2, maxDdR: -2, cancelled: 1, expired: 1, filled: 5 }); expect(s.fillRate).toBeCloseTo(5 / 7); expect(s.expR).toBeCloseTo(0.5);
  expect(s.equity.at(-1).r).toBe(2); expect(s.verdict.key).toBe("collecting");
  expect(verdict(30, { lo: -0.5, hi: -0.01 }).key).toBe("kill"); expect(verdict(29, { lo: -0.5, hi: -0.01 }).key).toBe("collecting");
  expect(verdict(12, { lo: 0, hi: 1 }).key).toBe("collecting"); expect(scorecard([-1, -1, -1, -1, -1].map((r, i) => ({ status: "closed", r_net: r, exit_t: i }))).verdict.key).toBe("collecting"); // −5R drawdown: not a kill
  expect(verdict(100, { lo: 0.01, hi: 1 }).key).toBe("promote"); expect(verdict(100, { lo: -0.01, hi: 1 }).key).toBe("nodecision");
  const f = parseTradeFilters({ tab: "filled", side: "long", status: "tp,sl" }); expect(filterTrades(T, f)).toHaveLength(4);
  expect(tradeCounts(T, f).tab).toMatchObject({ filled: 4, all: 4 }); expect(tradeCounts(T, { ...f, status: [] }).tab).toMatchObject({ filled: 5, cancelled: 1, all: 6 }); expect(tradesCsv(filterTrades(T, f)).trim().split("\n")).toHaveLength(5);
});
it("the spec doc carries the headline hash and the frozen v1 hash", () => {
  const doc = readFileSync("docs/FORWARD_SPEC.md", "utf8"); expect(doc).toContain(`\`${rulesHash()}\``); expect(doc).toContain(STRATEGY); expect(doc).toContain("`b81ceeeb`"); expect(doc).toContain("bn-1h-z2-v1");
  expect(SPEC.settings.exitMode).toBe(0); expect(SPEC.settings.minRR).toBe(3); expect(rulesHash(LEGACY_SPEC)).toBe("b81ceeeb"); expect(rulesHash()).not.toBe("b81ceeeb");
  for (const b of BOOKS) expect(BOOK_HASH[b.strategy]).toBe(b.hash);
});
it("job: freeze starts at the latest candle, persists trades + events idempotently, catches up after a gap", async () => {
  const db = new PGlite(); const q = async (t: string, p?: unknown[]) => (await db.query(t, p as any[])).rows as any[];
  // gently trending series so the scan finds setups
  const c = Array.from({ length: 700 }, (_, i) => { const b = 100 + 10 * Math.sin(i / 15) + i * 0.02; return { t: i * H, o: b, h: b + 1.2, l: b - 1.2, c: b + 0.3 * Math.sin(i), v: 100 + (i % 7) * 30 }; });
  const kl = async (_m: string, n: number) => c.filter((x) => x.t + H <= now).slice(-n); const fu = async () => ({ rows: [], src: "hl-proxy" });
  let now = 600 * H; const log = () => {};
  const tx = async (ss: Stmt[]) => { await db.transaction(async (t) => { for (const x of ss) await t.query(x.text, x.params as any[]); }); };
  const a = await paperJob(q, { now, klines: kl, funding: fu, log, tx }); expect(a.errors).toEqual([]);
  const curs = await q(`select strategy, market, last_t from fwd_trader`);
  expect(curs).toHaveLength(BOOKS.length * SPEC.markets.length);
  // The fixture is 1H candles for every timeframe. A 4H book only treats a candle as closed once its own bar has elapsed.
  const at = (tf: string) => curs.filter((r) => String(r.strategy).includes(`-${tf}-`)).map((r) => Number(r.last_t));
  expect(new Set(at("1h"))).toEqual(new Set([599 * H]));
  expect(new Set(at("15m"))).toEqual(new Set([599 * H]));
  expect(new Set(at("4h"))).toEqual(new Set([596 * H]));
  now = 690 * H; const b = await paperJob(q, { now, klines: kl, funding: fu, log, tx }); expect(b.errors).toEqual([]);
  const tr = await q(`select * from fwd_trades`); const ev = await q(`select * from fwd_events`);
  expect(tr.length).toBeGreaterThan(0); expect(ev.length).toBeGreaterThanOrEqual(tr.length);
  for (const m of SPEC.markets) for (const b of BOOKS) expect(tr.filter((t) => t.market === m && t.strategy === b.strategy && ["pending", "open"].includes(t.status)).length).toBeLessThanOrEqual(1);
  expect(ev.some((e) => e.kind === "replace")).toBe(false);
  // 4H on this 1H fixture has a 90-bar gap and a 42-bar cap, so it continues next run instead of skipping to the end.
  expect(Number((await q(`select last_t from fwd_trader where strategy = 'bn-4h-z2-v2' and market = 'BTCUSDT'`))[0].last_t)).toBe(638 * H);
  let prev = -1, n = 0;
  for (let i = 0; i < 6 && n !== prev; i++) { prev = n; await paperJob(q, { now, klines: kl, funding: fu, log, tx }); n = (await q(`select count(*)::int n from fwd_events`))[0].n; }
  await paperJob(q, { now, klines: kl, funding: fu, log, tx }); expect((await q(`select count(*)::int n from fwd_events`))[0].n).toBe(n);
});
it("paper.js constants match the trader", async () => { const p = await import("../src/forward/paper.js"); expect(p.STRATEGY_ID).toBe(STRATEGY); expect(p.RULES_HASH).toBe(rulesHash()); expect(p.MARKETS).toEqual([...SPEC.markets]); expect(p.LEGACY_ID).toBe("bn-1h-z2-v1"); expect(p.LEGACY_HASH).toBe("b81ceeeb");
  const boards = scoreboards([{ strategy: "bn-1h-z2-v2", status: "closed", exit_reason: "tp", r_net: 1, exit_t: 1, rules_hash: RULES() }, { strategy: "bn-15m-z1-v2", status: "closed", exit_reason: "sl", r_net: -1, exit_t: 2 }, { strategy: "bn-1h-z2-v1", status: "expired", r_net: null, exit_t: 3 }, { strategy: "bn-1h-z2-v1", status: "closed", exit_reason: "tp", r_net: 2, exit_t: 4 }]);
  expect(boards.map((b) => b.id)[0]).toBe("bn-1h-z2-v2"); expect(boards.at(-1)!.id).toBe("bn-1h-z2-v1"); expect(boards.at(-1)!.legacy).toBe(true); expect(boards).toHaveLength(10);
  expect(boards[0]).toMatchObject({ n: 1, avgR: 1, headline: true }); expect(boards.find((b) => b.id === "bn-15m-z1-v2")).toMatchObject({ n: 1, avgR: -1, tp: 0, sl: 1 });
  expect(boards.at(-1)).toMatchObject({ n: 1, sample: { closed: 1, expired: 1 } });
  const pool = combinedBoard([{ strategy: "bn-1h-z2-v2", status: "closed", exit_reason: "tp", r_net: 1, exit_t: 1 }, { strategy: "bn-15m-z1-v2", status: "closed", exit_reason: "sl", r_net: -1, exit_t: 2 }, { strategy: "bn-1h-z2-v1", status: "closed", exit_reason: "tp", r_net: 2, exit_t: 4 }, { strategy: "bn-1h-z2-v1", status: "expired" }]);
  expect(pool.id).toBe(COMBINED_ID); expect(pool.combined).toBe(true); expect(pool.legacy).toBe(false);
  expect(pool.n).toBe(2); expect(pool.tp).toBe(1); expect(pool.sl).toBe(1); expect(pool.score.totalR).toBe(0); expect(pool.sample.expired).toBe(0);
  expect(pool.note).toMatch(/Legacy v1/);
  expect(boards[0].n).toBe(1); expect(boards.at(-1)!.n).toBe(1);
});
it("the combined card adds the live books and recomputes drawdown", () => {
  const trades = [
    { strategy: "bn-1h-z2-v2", status: "closed", exit_reason: "tp", r_net: 5, exit_t: 1 },
    { strategy: "bn-1h-z2-v2", status: "closed", exit_reason: "sl", r_net: -1, exit_t: 4 },
    { strategy: "bn-15m-z1-v2", status: "closed", exit_reason: "sl", r_net: -4, exit_t: 2 },
    { strategy: "bn-15m-z1-v2", status: "pending", r_net: null, exit_t: null },
    { strategy: "bn-15m-z1-v2", status: "open", r_net: null, exit_t: null },
    { strategy: "bn-4h-z3-v2", status: "cancelled", r_net: null },
    { strategy: "bn-1h-z2-v1", status: "closed", exit_reason: "tp", r_net: 9, exit_t: 3 },
    { strategy: "bn-1h-z1-v2", status: "closed", exit_reason: "tp", r_net: 3, exit_t: 3 },
  ];
  const boards = scoreboards(trades);
  const live = boards.filter((b) => !b.legacy);
  const pool = combinedBoard(trades);
  const sum = (k: "n" | "pending" | "open" | "cancelled" | "expired" | "filled" | "tp" | "sl") => live.reduce((a, b) => a + b[k], 0);
  for (const k of ["n", "pending", "open", "cancelled", "expired", "filled", "tp", "sl"] as const) expect(pool[k]).toBe(sum(k));
  expect(pool.score.totalR).toBeCloseTo(live.reduce((a, b) => a + b.score.totalR, 0));
  expect(pool.n).toBe(4); expect(pool.tp).toBe(2); expect(pool.sl).toBe(2); expect(pool.pending).toBe(1); expect(pool.open).toBe(1); expect(pool.cancelled).toBe(1);
  expect(pool.fillRate).toBeCloseTo(5 / 6);
  expect(pool.avgR).toBeCloseTo((5 - 1 - 4 + 3) / 4);
  expect(pool.score.maxDdR).toBeCloseTo(-4);
  expect(live.reduce((a, b) => a + b.score.maxDdR, 0)).not.toBeCloseTo(pool.score.maxDdR);
  const only15 = combinedBoard(trades, [{ id: "bn-15m-z1-v2", legacy: false }, { id: "bn-1h-z2-v1", legacy: true }]);
  expect(only15.n).toBe(1); expect(only15.sl).toBe(1); expect(only15.pending).toBe(1);
  expect(boards.find((b) => b.id === "bn-1h-z2-v2")!.n).toBe(2);
  expect(boards.find((b) => b.legacy)!.score.totalR).toBe(9);
});
const RULES = () => rulesHash();
it("daily loss limit: −3R realized in a WIB day cancels the pending order, blocks new ones, keeps the open position, resumes next WIB day", () => {
  // WIB midnight = 17:00 UTC. Start the day with −2.9R already realized; one more stop crosses −3R.
  const d0 = Date.parse("2026-10-14T17:00:00Z"); const kk = (h: number, o: number, hi: number, lo: number, c: number) => ({ t: d0 + h * H, o, h: hi, l: lo, c, v: 1 });
  let st: State = { order: null, pos: { ...{ market: M, side: "long", status: "open", placed_t: d0, entry: 100, sl: 98, tp: 106, risk: 2, conf: 1, replaced: 0, fill_t: d0, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null } as Trade }, day: { key: "2026-10-15", r: -2.9, hit: false } };
  let r = step(st, kk(1, 99, 99, 97, 98), [L], M); expect(r.events.map((e) => e.kind)).toEqual(["close", "limit"]); expect(r.state.order).toBeNull(); expect(r.state.day!.hit).toBe(true);
  expect(r.events[1].data.msg).toBe("daily limit hit");
  r = step(r.state, kk(5, 101, 102, 100.5, 101), [L], M); expect(r.events).toEqual([]); expect(r.state.order).toBeNull();
  // a pending order gets cancelled when the limit hits, and an open position (other trader state) is untouched by the pause
  const pend = { ...st.pos!, status: "pending" as const, placed_t: d0 + H }; r = step({ order: pend, pos: null, day: { key: "2026-10-15", r: -3.2, hit: false } }, kk(2, 101, 102, 100.5, 101), [L], M);
  expect(r.events.map((e) => [e.kind, e.data.why])).toEqual([["limit", undefined], ["cancel", "daily limit"]]);
  const open = step({ order: null, pos: st.pos, day: { key: "2026-10-15", r: -3.5, hit: true } }, kk(3, 101, 107, 100.5, 106), [L], M); expect(open.closed[0].exit_reason).toBe("tp"); expect(open.state.order).toBeNull();
  r = step(r.state, kk(24, 101, 102, 100.5, 101), [L], M); expect(r.state.day!.key).toBe("2026-10-16"); expect(r.events.map((e) => e.kind)).toEqual(["place"]);
});

const mkDb = () => { const db = new PGlite(); const q = async (t: string, p?: unknown[]) => (await db.query(t, p as any[])).rows as any[];
  const tx = async (ss: Stmt[]) => { await db.transaction(async (t) => { for (const x of ss) await t.query(x.text, x.params as any[]); }); }; return { db, q, tx }; };
const series = Array.from({ length: 700 }, (_, i) => { const b = 100 + 10 * Math.sin(i / 15) + i * 0.02; return { t: i * H, o: b, h: b + 1.2, l: b - 1.2, c: b + 0.3 * Math.sin(i), v: 100 + (i % 7) * 30 }; });
const klAt = (now: number) => async (_m: string, n: number) => series.filter((x) => x.t + H <= now).slice(-n);
const fu0 = async () => ({ rows: [], src: "hl-proxy" }); const quiet = () => {};
const dump = async (q: any) => ({ tr: (await q(`select key, status, placed_t, fill_t, exit_t, bars, replaced, r_net from fwd_trades order by key`)), ev: (await q(`select strategy, market, kind, t, trade_key from fwd_events order by strategy, market, t, kind, trade_key`)), cur: (await q(`select strategy, market, last_t from fwd_trader order by strategy, market`)) });
it("WIB day is one half-open rule [00:00, next 00:00): trader, job restore and page agree at the 00:00 WIB candle close", async () => {
  const mid = Date.parse("2026-10-15T00:00:00+07:00");
  expect(wibDay(mid)).toBe("2026-10-15"); expect(wibDay(mid - 1)).toBe("2026-10-14"); expect(wibRange("2026-10-15")).toEqual([mid, mid + 864e5]);
  // page: a close + limit at exactly 00:00 WIB counts for the new day, not the old one
  const T = [{ market: M, status: "closed", exit_t: mid, r_net: -3.1 }]; const lim = [{ market: M, t: mid }];
  expect(today(T, lim, mid + 5 * H)[M]).toMatchObject({ r: -3.1, hit: true }); expect(today(T, lim, mid - H)[M]).toMatchObject({ r: 0, hit: false });
  // job: a limit stored at 00:00 WIB is restored on the next run, so the coin stays paused that day
  const { q, tx } = mkDb(); const base = Math.floor(mid / H) - 600; const ser = series.map((x, i) => ({ ...x, t: (base + i) * H }));
  const kl = (now: number) => async (_m: string, n: number) => ser.filter((x) => x.t + H <= now).slice(-n);
  await paperJob(q, { now: mid, klines: kl(mid), funding: fu0, log: quiet, tx }); // freeze: cursor on the candle closing at 00:00 WIB
  await q(`insert into fwd_events (strategy, market, kind, t, data) values ($1,$2,'limit',$3,'{}')`, [STRATEGY, M, mid]);
  await paperJob(q, { now: mid + 6 * H, klines: kl(mid + 6 * H), funding: fu0, log: quiet, tx });
  const ev = await q(`select kind from fwd_events where strategy=$1 and market=$2 and t > $3`, [STRATEGY, M, mid]); expect(ev.filter((e) => e.kind === "place")).toEqual([]);
});
it("job: a crash midway through a coin's run leaves no half-written candle, and the rerun gives exactly the same rows as a clean run (no double count or fill)", async () => {
  const clean = mkDb(); let now = 600 * H; await paperJob(clean.q, { now, klines: klAt(now), funding: fu0, log: quiet, tx: clean.tx });
  now = 690 * H; await paperJob(clean.q, { now, klines: klAt(now), funding: fu0, log: quiet, tx: clean.tx }); const want = await dump(clean.q);
  expect(want.ev.filter((e: any) => e.kind === "fill").length).toBeGreaterThan(0);
  const c = mkDb(); now = 600 * H; await paperJob(c.q, { now, klines: klAt(now), funding: fu0, log: quiet, tx: c.tx });
  // crash after 40 candle writes, mid-transaction: the statements run, then the network dies before commit
  let n = 0; const crashy = async (ss: Stmt[]) => { if (++n > 40) await c.db.transaction(async (t) => { await t.query(ss[0].text, ss[0].params as any[]); throw new Error("ECONNRESET"); }); else await c.tx(ss); };
  now = 690 * H; const a = await paperJob(c.q, { now, klines: klAt(now), funding: fu0, log: quiet, tx: crashy }); expect(a.errors.length).toBe(3);
  const mid = await dump(c.q); expect(mid.cur.every((r: any) => Number(r.last_t) < 689 * H)).toBe(true);
  await paperJob(c.q, { now, klines: klAt(now), funding: fu0, log: quiet, tx: c.tx }); const got = await dump(c.q);
  expect(got.cur).toEqual(want.cur); expect(got.ev).toEqual(want.ev); expect(got.tr.map(({ r_net, ...x }: any) => x)).toEqual(want.tr.map(({ r_net, ...x }: any) => x));
  got.tr.forEach((t: any, i: number) => expect(t.r_net ?? 0).toBeCloseTo(want.tr[i].r_net ?? 0, 9));
});

test("trade IDs: F-12 display, search accepts 12 / F-12 / f12, CSV first column", () => {
  for (const v of ["12", "F-12", "f12", " f-12 ", "#12"]) expect(parseTradeId(v)).toBe("12");
  for (const v of ["", "abc", "F-", "1.5"]) expect(parseTradeId(v)).toBe("");
  expect(tradeId({ id: 12 })).toBe("F-12");
  const T: any[] = [{ id: 12, market: "BTCUSDT", side: "long", status: "pending" }, { id: 3, market: "ETHUSDT", side: "short", status: "pending" }];
  expect(filterTrades(T, parseTradeFilters({ id: "f12" })).map((t) => t.id)).toEqual([12]);
  expect(filterTrades(T, parseTradeFilters({})).length).toBe(2);
  const csv = tradesCsv(T).split("\n"); expect(csv[0].startsWith("id,strategy")).toBe(true); expect(csv[1].startsWith("F-12,")).toBe(true);
});
