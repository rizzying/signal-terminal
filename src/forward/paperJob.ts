// v3.0 hourly job: run the frozen strategy's virtual traders on new closed Binance 1H candles. Idempotent (cursor + keyed upserts).
import type { Candle } from "../engine/indicators";
import { SPEC, STRATEGY, rulesHash, plansAt, step, tradeKey, wibDay, type State, type Trade } from "./trader";
import { ensurePaperSchema, type Q } from "./db";
/** Runs a list of statements atomically (all or nothing). Neon: sql.transaction; PGlite: db.transaction. */
export type Stmt = { text: string; params: unknown[] }; export type Tx = (stmts: Stmt[]) => Promise<void>;
/** WIB day as a half-open range [00:00, next 00:00) WIB. Same rule as wibDay() in the trader and today() on the page. */
export const wibRange = (key: string) => { const d0 = Date.parse(key + "T00:00:00+07:00"); return [d0, d0 + 864e5] as const; };
const H = 3.6e6; export const PAPER_CATCHUP = 72;
export type KFetch = (market: string, n: number) => Promise<Candle[]>;
export type FFetch = (market: string, from: number) => Promise<{ rows: { t: number; rate: number }[]; src: string }>;
const get = async (url: string, init?: RequestInit) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
export const binanceKlines: KFetch = async (m, n) => (await get(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=1h&limit=${Math.min(1000, n)}`)).map((k: any[]) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
/** Binance USDT-M funding if reachable (GitHub runners are often geo-blocked), else Hyperliquid's for the same coin, labelled as a proxy. */
export const funding: FFetch = async (m, from) => {
  try { const r = await get(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${m}&startTime=${from}&limit=1000`); return { rows: r.map((x: any) => ({ t: +x.fundingTime, rate: +x.fundingRate })), src: "binance" }; }
  catch { const r = await get("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "fundingHistory", coin: m.replace(/USDT$/, ""), startTime: from }) });
    return { rows: r.map((x: any) => ({ t: +x.time, rate: +x.fundingRate })), src: "hl-proxy" }; }
};
const COLS = ["key", "strategy", "rules_hash", "market", "side", "status", "placed_t", "entry", "sl", "tp", "risk", "conf", "replaced", "fill_t", "exit_t", "exit_px", "exit_reason", "bars", "r_gross", "cost_r", "funding_r", "funding_src", "r_net"] as const;
function upsert(t: Trade): Stmt {
  const row: any = { ...t, key: tradeKey(t), strategy: STRATEGY, rules_hash: rulesHash() };
  return { text: `insert into fwd_trades (${COLS.join(",")}) values (${COLS.map((_, i) => `$${i + 1}`).join(",")}) on conflict (key) do update set ${COLS.slice(5).map((c) => `${c}=excluded.${c}`).join(",")}, updated_at=now()`, params: COLS.map((c) => row[c] ?? null) };
}
const cursorStmt = (m: string, t: number): Stmt => ({ text: `insert into fwd_trader (strategy, market, last_t) values ($1,$2,$3) on conflict (strategy, market) do update set last_t=excluded.last_t`, params: [STRATEGY, m, t] });
const toTrade = (r: any): Trade => ({ market: r.market, side: r.side, status: r.status, placed_t: Number(r.placed_t), entry: +r.entry, sl: +r.sl, tp: +r.tp, risk: +r.risk, conf: r.conf, replaced: r.replaced,
  fill_t: r.fill_t == null ? null : Number(r.fill_t), exit_t: null, exit_px: null, exit_reason: null, bars: r.bars, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null });
export async function paperJob(q: Q, o: { now?: number; klines?: KFetch; funding?: FFetch; log?: (s: string) => void; tx?: Tx } = {}) {
  const now = o.now ?? Date.now(); const log = o.log ?? console.log; const kl = o.klines ?? binanceKlines; const ff = o.funding ?? funding;
  const tx: Tx = o.tx ?? (async (ss) => { for (const x of ss) await q(x.text, x.params); }); // fallback is NOT atomic; production and tests pass a real tx
  await ensurePaperSchema(q); const errors: string[] = []; let events = 0, closed = 0; const srcs = new Set<string>();
  await Promise.all(SPEC.markets.map(async (m) => { try {
    const c = (await kl(m, SPEC.window + PAPER_CATCHUP + 2)).filter((k) => k.t + H <= now).sort((a, b) => a.t - b.t); if (!c.length) throw new Error("no candles");
    const live = await q(`select * from fwd_trades where strategy=$1 and market=$2 and status in ('pending','open')`, [STRATEGY, m]);
    let st: State = { order: null, pos: null }; for (const r of live) st[r.status === "open" ? "pos" : "order"] = toTrade(r);
    const cur = (await q(`select last_t from fwd_trader where strategy=$1 and market=$2`, [STRATEGY, m]))[0]?.last_t;
    const last = Number(cur ?? c.at(-1)!.t - 1); // first run = freeze: start on the latest closed candle, no back-fill
    const todo = c.map((_, i) => i).filter((i) => c[i].t > last).slice(-PAPER_CATCHUP);
    if (todo.length) { // today's realized R (WIB day of the first candle to process) so the daily limit survives across runs
      const key = wibDay(c[todo[0]].t + H); const [d0, d1] = wibRange(key);
      const r = (await q(`select coalesce(sum(r_net),0) r from fwd_trades where strategy=$1 and market=$2 and status='closed' and exit_t >= $3 and exit_t < $4`, [STRATEGY, m, d0, d1]))[0].r;
      const hit = (await q(`select 1 from fwd_events where strategy=$1 and market=$2 and kind='limit' and t >= $3 and t < $4`, [STRATEGY, m, d0, d1])).length > 0;
      st.day = { key, r: +r, hit }; }
    let fund: Awaited<ReturnType<FFetch>> | undefined;
    if (todo.length) { const from = Math.min(st.pos?.fill_t ?? Infinity, c[todo[0]].t) - H; try { fund = await ff(m, from); srcs.add(fund.src); } catch (e: any) { errors.push(`${m} funding: ${e.message}`); } }
    // each candle is one atomic write: its events, trade rows and the cursor move together, so a crash mid-run never re-processes a stored candle
    for (const i of todo) {
      const r = step(st, c[i], plansAt(c.slice(Math.max(0, i + 1 - SPEC.window), i + 1), m), m, fund); const w: Stmt[] = [];
      for (const e of r.events) { if (e.tr) w.push(upsert(e.tr)); w.push({ text: `insert into fwd_events (strategy, market, trade_key, kind, t, data) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, params: [STRATEGY, m, e.tr ? tradeKey(e.tr) : null, e.kind, e.t, JSON.stringify(e.data)] }); }
      for (const t of [r.state.order, r.state.pos]) if (t) w.push(upsert(t)); // bar counts
      w.push(cursorStmt(m, c[i].t)); await tx(w);
      events += r.events.length; closed += r.closed.filter((t) => t.status === "closed").length; st = r.state;
    }
    if (!todo.length) await tx([cursorStmt(m, Math.max(last, c.at(-1)!.t))]);
    log(`${m}: ${todo.length} new candle(s); order ${st.order ? `${st.order.side} @ ${st.order.entry}` : "none"}; position ${st.pos ? `${st.pos.side} @ ${st.pos.entry}` : "none"}`);
  } catch (e: any) { errors.push(`${m}: ${String(e.message ?? e).slice(0, 200)}`); } }));
  return { events, closed, errors, funding: [...srcs].join(",") || null };
}
