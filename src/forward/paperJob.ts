// v3.2 hourly job: nine locked scorecards on Binance spot (15m, 1H, 4H × zones 1–3).
// One candle fetch per market × timeframe, then each zone steps on its own book. Idempotent (cursor + keyed upserts).
import type { Candle } from "../engine/indicators";
import { BOOKS, SPEC, plansByZone, step, tradeKey, wibDay, type Book, type State, type Trade, type Tf } from "./trader";
import { ensurePaperSchema, type Q } from "./db";
import { TF_MS, TF_INTERVAL, TFS } from "./books.js";
// @ts-ignore js module
import { excursion } from "./shadow.js";
/** Runs a list of statements atomically (all or nothing). Neon: sql.transaction; PGlite: db.transaction. */
export type Stmt = { text: string; params: unknown[] }; export type Tx = (stmts: Stmt[]) => Promise<void>;
/** WIB day as a half-open range [00:00, next 00:00) WIB. Same rule as wibDay() in the trader and today() on the page. */
export const wibRange = (key: string) => { const d0 = Date.parse(key + "T00:00:00+07:00"); return [d0, d0 + 864e5] as const; };
/**
 * Oldest-first cap, per timeframe, for one run. A normal hour is 4×15m + 1×1H and sometimes 1×4H.
 * A week of downtime still finishes in one run. Anything older is left on the cursor and continued next hour — never skipped.
 */
export const MAX_BARS: Record<Tf, number> = { "15m": 7 * 24 * 4, "1h": 7 * 24, "4h": 7 * 6 };
export type KFetch = (market: string, n: number, interval?: string) => Promise<Candle[]>;
export type FFetch = (market: string, from: number) => Promise<{ rows: { t: number; rate: number }[]; src: string }>;
const get = async (url: string, init?: RequestInit) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const mapK = (k: any[]): Candle => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
/** Most recent `n` Binance spot klines, paging backward when n > 1000. Oldest first, deduped. */
export const binanceKlines: KFetch = async (m, n, interval = "1h") => {
  const want = Math.min(5000, Math.max(1, n)); const by = new Map<number, Candle>(); let end: number | undefined;
  while (by.size < want) {
    const lim = Math.min(1000, want - by.size);
    const page = await get(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=${interval}&limit=${lim}${end != null ? `&endTime=${end}` : ""}`);
    if (!Array.isArray(page) || !page.length) break;
    const rows = page.map(mapK); const oldest = rows[0].t;
    for (const k of rows) by.set(k.t, k);
    if (rows.length < lim || (end != null && oldest >= end)) break;
    end = oldest - 1;
  }
  return [...by.values()].sort((a, b) => a.t - b.t).slice(-want);
};
/** Binance USDT-M funding if reachable (GitHub runners are often geo-blocked), else Hyperliquid's for the same coin, labelled as a proxy. */
export const funding: FFetch = async (m, from) => {
  try { const r = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${m}&startTime=${from}&limit=1000`); return { rows: r.map((x: any) => ({ t: +x.fundingTime, rate: +x.fundingRate })), src: "binance" }; }
  catch { const r = await get("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "fundingHistory", coin: m.replace(/USDT$/, ""), startTime: from }) });
    return { rows: r.map((x: any) => ({ t: +x.time, rate: +x.fundingRate })), src: "hl-proxy" }; }
};
const COLS = ["key", "strategy", "rules_hash", "market", "side", "status", "placed_t", "entry", "sl", "tp", "risk", "conf", "replaced", "fill_t", "exit_t", "exit_px", "exit_reason", "bars", "r_gross", "cost_r", "funding_r", "funding_src", "r_net"] as const;
function upsert(t: Trade, book: Book): Stmt {
  const row: any = { ...t, key: tradeKey(t, book.strategy), strategy: book.strategy, rules_hash: book.hash };
  return { text: `insert into fwd_trades (${COLS.join(",")}) values (${COLS.map((_, i) => `$${i + 1}`).join(",")}) on conflict (key) do update set ${COLS.slice(5).map((c) => `${c}=excluded.${c}`).join(",")}, updated_at=now()`, params: COLS.map((c) => row[c] ?? null) };
}
const cursorStmt = (book: Book, m: string, t: number): Stmt => ({ text: `insert into fwd_trader (strategy, market, last_t) values ($1,$2,$3) on conflict (strategy, market) do update set last_t=excluded.last_t`, params: [book.strategy, m, t] });
const toTrade = (r: any): Trade => ({ market: r.market, side: r.side, status: r.status, placed_t: Number(r.placed_t), entry: +r.entry, sl: +r.sl, tp: +r.tp, risk: +r.risk, conf: r.conf, replaced: r.replaced,
  fill_t: r.fill_t == null ? null : Number(r.fill_t), exit_t: null, exit_px: null, exit_reason: null, bars: r.bars, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null });

/** Closed candles strictly after `last`, oldest first, at most `cap`. Null last = first run: the single latest closed candle (no back-fill). */
export function barsDue(closed: Candle[], last: number | null, cap: number): Candle[] {
  if (!closed.length) return [];
  if (last == null) return [closed[closed.length - 1]];
  const due = closed.filter((k) => k.t > last);
  return due.length > cap ? due.slice(0, cap) : due;
}

export async function paperJob(q: Q, o: { now?: number; klines?: KFetch; funding?: FFetch; log?: (s: string) => void; tx?: Tx; books?: Book[] } = {}) {
  const now = o.now ?? Date.now(); const log = o.log ?? console.log; const kl = o.klines ?? binanceKlines; const ff = o.funding ?? funding;
  const books = o.books ?? BOOKS;
  const tx: Tx = o.tx ?? (async (ss) => { for (const x of ss) await q(x.text, x.params); }); // fallback is NOT atomic; production and tests pass a real tx
  await ensurePaperSchema(q); const errors: string[] = []; let events = 0, closed = 0; const srcs = new Set<string>();
  const byTf = new Map<Tf, Book[]>(); for (const b of books) { const a = byTf.get(b.tf) ?? []; a.push(b); byTf.set(b.tf, a); }
  await Promise.all(SPEC.markets.map(async (m) => { try {
    const curRows = await q(`select strategy, last_t from fwd_trader where market=$1`, [m]);
    const cursors = new Map<string, number>(curRows.map((r) => [r.strategy, Number(r.last_t)]));
    const live = await q(`select * from fwd_trades where market=$1 and status in ('pending','open')`, [m]);
    const liveBy = new Map<string, Trade[]>(); for (const r of live) { const a = liveBy.get(r.strategy) ?? []; a.push(r); liveBy.set(r.strategy, a); }
    const series = new Map<Tf, { c: Candle[]; forming?: Candle }>();
    for (const tf of TFS) {
      const group = byTf.get(tf as Tf); if (!group?.length) continue;
      const bar = TF_MS[tf];
      const known = group.map((b) => cursors.get(b.strategy)).filter((t): t is number => t != null);
      const oldest = known.length ? Math.min(...known) : null;
      const n = oldest == null ? SPEC.window + 2 : Math.min(5000, Math.ceil((now - (oldest - (SPEC.window - 1) * bar)) / bar) + 2);
      const raw = await kl(m, n, TF_INTERVAL[tf]);
      const c = raw.filter((k) => k.t + bar <= now).sort((a, b) => a.t - b.t);
      const forming = raw.find((k) => k.t <= now && k.t + bar > now);
      series.set(tf as Tf, { c, forming });
    }
    let fundFrom = Infinity; const touched: { t: Trade; book: Book; c: Candle[]; forming?: Candle }[] = [];
    const work: { book: Book; c: Candle[]; todo: number[]; bar: number }[] = [];
    for (const book of books) {
      const pack = series.get(book.tf); if (!pack?.c.length) { log(`${m} ${book.tf}: no closed candles`); continue; }
      const { c } = pack; const bar = book.barMs; const cur = cursors.has(book.strategy) ? cursors.get(book.strategy)! : null;
      if (cur != null && c[0].t > cur + bar) { errors.push(`${m} ${book.strategy}: candle gap after cursor, not skipping`); continue; }
      const due = barsDue(c, cur, MAX_BARS[book.tf]);
      const idx = new Map(c.map((k, i) => [k.t, i]));
      const todo = due.map((k) => idx.get(k.t)!);
      if (todo.length) fundFrom = Math.min(fundFrom, c[todo[0]].t);
      work.push({ book, c, todo, bar });
    }
    let fund: Awaited<ReturnType<FFetch>> | undefined;
    if (Number.isFinite(fundFrom)) {
      const openFill = live.map((r) => r.fill_t == null ? Infinity : Number(r.fill_t)).reduce((a, b) => Math.min(a, b), Infinity);
      try { fund = await ff(m, Math.min(openFill, fundFrom) - TF_MS["1h"]); srcs.add(fund.src); } catch (e: any) { errors.push(`${m} funding: ${e.message}`); }
    }
    const planCache = new Map<string, Record<number, ReturnType<typeof plansByZone>[number]>>();
    for (const { book, c, todo } of work) {
      const st0: State = { order: null, pos: null };
      for (const r of liveBy.get(book.strategy) ?? []) st0[r.status === "open" ? "pos" : "order"] = toTrade(r);
      let st = st0;
      if (todo.length) {
        const key = wibDay(c[todo[0]].t + book.barMs); const [d0, d1] = wibRange(key);
        const r = (await q(`select coalesce(sum(r_net),0) r from fwd_trades where strategy=$1 and market=$2 and status='closed' and exit_t >= $3 and exit_t < $4`, [book.strategy, m, d0, d1]))[0].r;
        const hit = (await q(`select 1 from fwd_events where strategy=$1 and market=$2 and kind='limit' and t >= $3 and t < $4`, [book.strategy, m, d0, d1])).length > 0;
        st.day = { key, r: +r, hit };
      }
      for (const i of todo) {
        const cacheKey = `${book.tf}|${i}`;
        let zonePlans = planCache.get(cacheKey);
        if (!zonePlans) { zonePlans = plansByZone(c.slice(Math.max(0, i + 1 - SPEC.window), i + 1), m); planCache.set(cacheKey, zonePlans); }
        const r = step(st, c[i], zonePlans[book.zone] ?? [], m, fund, book.barMs); const w: Stmt[] = [];
        for (const e of r.events) { if (e.tr) w.push(upsert(e.tr, book)); w.push({ text: `insert into fwd_events (strategy, market, trade_key, kind, t, data) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, params: [book.strategy, m, e.tr ? tradeKey(e.tr, book.strategy) : null, e.kind, e.t, JSON.stringify(e.data)] }); }
        for (const t of [r.state.order, r.state.pos]) if (t) w.push(upsert(t, book));
        w.push(cursorStmt(book, m, c[i].t)); await tx(w);
        for (const t of r.closed) if (t.fill_t != null) touched.push({ t, book, c, forming: series.get(book.tf)?.forming });
        events += r.events.length; closed += r.closed.filter((t) => t.status === "closed").length; st = r.state;
      }
      if (!todo.length) await tx([cursorStmt(book, m, Math.max(cursors.get(book.strategy) ?? 0, c.at(-1)!.t))]);
      if (st.pos?.fill_t != null) touched.push({ t: st.pos, book, c, forming: series.get(book.tf)?.forming });
      log(`${m} ${book.strategy}: ${todo.length} new candle(s); order ${st.order ? `${st.order.side} @ ${st.order.entry}` : "none"}; position ${st.pos ? `${st.pos.side} @ ${st.pos.entry}` : "none"}`);
    }
    for (const x of touched) { const ex = excursion(x.t, x.c, x.t.fill_t, x.t.status === "open" ? null : x.t.exit_t, x.t.status === "open" ? x.forming : undefined);
      if (ex.mfe != null) await q(`update fwd_trades set mfe_r = greatest(mfe_r, $2), mae_r = least(mae_r, $3) where key = $1`, [tradeKey(x.t, x.book.strategy), ex.mfe, ex.mae]); }
  } catch (e: any) { errors.push(`${m}: ${String(e.message ?? e).slice(0, 200)}`); } }));
  return { events, closed, errors, funding: [...srcs].join(",") || null };
}
