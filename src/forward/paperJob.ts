// v3.0 hourly job: run the frozen strategy's virtual traders on new closed Binance 1H candles. Idempotent (cursor + keyed upserts).
import type { Candle } from "../engine/indicators";
import { SPEC, STRATEGY, rulesHash, plansAt, step, tradeKey, wibDay, type State, type Trade } from "./trader";
import { ensurePaperSchema, type Q } from "./db";
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
async function upsert(q: Q, t: Trade) {
  const row: any = { ...t, key: tradeKey(t), strategy: STRATEGY, rules_hash: rulesHash() };
  await q(`insert into fwd_trades (${COLS.join(",")}) values (${COLS.map((_, i) => `$${i + 1}`).join(",")}) on conflict (key) do update set ${COLS.slice(5).map((c) => `${c}=excluded.${c}`).join(",")}, updated_at=now()`, COLS.map((c) => row[c] ?? null));
}
const toTrade = (r: any): Trade => ({ market: r.market, side: r.side, status: r.status, placed_t: Number(r.placed_t), entry: +r.entry, sl: +r.sl, tp: +r.tp, risk: +r.risk, conf: r.conf, replaced: r.replaced,
  fill_t: r.fill_t == null ? null : Number(r.fill_t), exit_t: null, exit_px: null, exit_reason: null, bars: r.bars, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null });
export async function paperJob(q: Q, o: { now?: number; klines?: KFetch; funding?: FFetch; log?: (s: string) => void } = {}) {
  const now = o.now ?? Date.now(); const log = o.log ?? console.log; const kl = o.klines ?? binanceKlines; const ff = o.funding ?? funding;
  await ensurePaperSchema(q); const errors: string[] = []; let events = 0, closed = 0; const srcs = new Set<string>();
  await Promise.all(SPEC.markets.map(async (m) => { try {
    const c = (await kl(m, SPEC.window + PAPER_CATCHUP + 2)).filter((k) => k.t + H <= now).sort((a, b) => a.t - b.t); if (!c.length) throw new Error("no candles");
    const live = await q(`select * from fwd_trades where strategy=$1 and market=$2 and status in ('pending','open')`, [STRATEGY, m]);
    let st: State = { order: null, pos: null }; for (const r of live) st[r.status === "open" ? "pos" : "order"] = toTrade(r);
    const cur = (await q(`select last_t from fwd_trader where strategy=$1 and market=$2`, [STRATEGY, m]))[0]?.last_t;
    const last = Number(cur ?? c.at(-1)!.t - 1); // first run = freeze: start on the latest closed candle, no back-fill
    const todo = c.map((_, i) => i).filter((i) => c[i].t > last).slice(-PAPER_CATCHUP);
    if (todo.length) { // today's realized R (WIB day of the first candle to process) so the daily limit survives across runs
      const key = wibDay(c[todo[0]].t + H); const d0 = Date.parse(key + "T00:00:00+07:00");
      const r = (await q(`select coalesce(sum(r_net),0) r from fwd_trades where strategy=$1 and market=$2 and status='closed' and exit_t > $3 and exit_t <= $4`, [STRATEGY, m, d0, d0 + 864e5]))[0].r;
      const hit = (await q(`select 1 from fwd_events where strategy=$1 and market=$2 and kind='limit' and t > $3 and t <= $4`, [STRATEGY, m, d0, d0 + 864e5])).length > 0;
      st.day = { key, r: +r, hit }; }
    let fund: Awaited<ReturnType<FFetch>> | undefined;
    if (todo.length) { const from = Math.min(st.pos?.fill_t ?? Infinity, c[todo[0]].t) - H; try { fund = await ff(m, from); srcs.add(fund.src); } catch (e: any) { errors.push(`${m} funding: ${e.message}`); } }
    for (const i of todo) {
      const r = step(st, c[i], plansAt(c.slice(Math.max(0, i + 1 - SPEC.window), i + 1), m), m, fund);
      for (const e of r.events) { if (e.tr) await upsert(q, e.tr); await q(`insert into fwd_events (strategy, market, trade_key, kind, t, data) values ($1,$2,$3,$4,$5,$6) on conflict do nothing`, [STRATEGY, m, e.tr ? tradeKey(e.tr) : null, e.kind, e.t, JSON.stringify(e.data)]); events++; }
      closed += r.closed.filter((t) => t.status === "closed").length; st = r.state;
    }
    for (const t of [st.order, st.pos]) if (t) await upsert(q, t); // bar counts
    await q(`insert into fwd_trader (strategy, market, last_t) values ($1,$2,$3) on conflict (strategy, market) do update set last_t=excluded.last_t`, [STRATEGY, m, c.at(-1)!.t]);
    log(`${m}: ${todo.length} new candle(s); order ${st.order ? `${st.order.side} @ ${st.order.entry}` : "none"}; position ${st.pos ? `${st.pos.side} @ ${st.pos.entry}` : "none"}`);
  } catch (e: any) { errors.push(`${m}: ${String(e.message ?? e).slice(0, 200)}`); } }));
  return { events, closed, errors, funding: [...srcs].join(",") || null };
}
