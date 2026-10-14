// Vercel function: public, read-only v3.0 forward test (virtual trader). Scorecard + trade list (JSON) or CSV.
import { shadowReplay, shadowSummary, unrealR, openWhatIfR, excursion } from "../src/forward/shadow.js";
import { neon } from "@neondatabase/serverless";
import { scorecard, parseTradeFilters, filterTrades, tradeCounts, tradesCsv, today, STRATEGY_ID, STRATEGY_NAME, RULES_HASH, MARKETS } from "../src/forward/paper.js";
export const config = { maxDuration: 20 };
export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ configured: false }); }
  try {
    const sql = neon(url); const q = req.query ?? {}; const f = parseTradeFilters(q);
    const has = (await sql.query(`select 1 from information_schema.tables where table_name = 'fwd_trades'`)).length > 0;
    const [T, runs, cur, ev, lim] = has ? await Promise.all([
      sql.query(`select * from fwd_trades where strategy = $1 order by placed_t desc, id desc limit 5000`, [STRATEGY_ID]),
      sql.query(`select at, paper, (errors is not null) as had_errors from fwd_runs order by id desc limit 1`),
      sql.query(`select market, last_t from fwd_trader where strategy = $1`, [STRATEGY_ID]),
      sql.query(`select market, trade_key, kind, t, data from fwd_events where strategy = $1 order by t desc, id desc limit 60`, [STRATEGY_ID]),
      sql.query(`select market, t from fwd_events where strategy = $1 and kind = 'limit' and t > $2`, [STRATEGY_ID, Date.now() - 2 * 864e5]),
    ]) : [[], [], [], [], []];
        // What-if replay of cancelled orders (research only, not counted anywhere). Closed Binance 1H candles since the earliest cancel, per market.
    // Live price per market (last 1H candle close, incl. the forming one). Display only: unrealized R for open trades.
    const live = {}; await Promise.all(MARKETS.map(async (m) => { try { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=1h&limit=1`); if (r.ok) { const k = (await r.json())[0]; if (k) live[m] = { px: +k[4], t: Date.now() }; } } catch {} }));
    // Closed Binance 1H candles per market from a start time (shared by the what-if replay and MFE/MAE). Research only.
    const now = Date.now(); const C = T.filter((t) => t.status === "cancelled" && t.exit_t != null); const F = T.filter((t) => t.fill_t != null);
    const need = {}; for (const t of C) need[t.market] = Math.min(need[t.market] ?? Infinity, Number(t.exit_t)); for (const t of F) need[t.market] = Math.min(need[t.market] ?? Infinity, Number(t.fill_t));
    let byM = {}, kErr = false;
    try { await Promise.all(Object.entries(need).map(async ([m, from]) => { const K = [];
        for (let i = 0; i < 5 && from < now - 3.6e6; i++) { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=1h&startTime=${from}&limit=1000`); if (!r.ok) throw new Error("klines");
          const a = (await r.json()).map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })).filter((k) => k.t + 3.6e6 <= now); if (!a.length) break; K.push(...a); from = a.at(-1).t + 3.6e6; if (a.length < 1000) break; }
        byM[m] = K; })); } catch { kErr = true; byM = {}; }
    const exc = (t, fillT, exitT) => kErr ? { mfe: null, mae: null } : excursion(t, byM[t.market] ?? [], fillT, exitT, exitT == null ? live[t.market]?.px : undefined);
    const T2 = T.map((t) => t.fill_t == null ? t : { ...t, ...exc(t, t.fill_t, t.status === "open" ? null : t.exit_t) });
    let shadow = null;
    if (q.format !== "csv") { if (kErr) shadow = { note: "what-if, not counted", error: "Couldn't load Binance candles for the check right now." }; else {
      const rowsS = C.map((t) => { const x = { id: String(t.id), ...shadowReplay(t, byM[t.market] ?? []) }; return { ...x, ...exc(t, x.fill_t, x.status === "open" ? null : x.exit_t) }; });
      for (const x of rowsS) if (x.status === "open") { const t = C.find((y) => String(y.id) === x.id); x.now = live[t.market]?.px ?? null; x.ur = unrealR(t, x.now); }
      shadow = { note: "what-if, not counted", summary: { ...shadowSummary(rowsS), openR: openWhatIfR(rowsS, C, live) }, rows: Object.fromEntries(rowsS.map((x) => [x.id, x])) }; } }
    const rowsX = filterTrades(T2, f);
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="forward-${STRATEGY_ID}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(tradesCsv([...rowsX].sort((a, b) => Number(a.placed_t) - Number(b.placed_t))));
    }
    return res.status(200).json({ configured: true, strategy: { id: STRATEGY_ID, name: STRATEGY_NAME, rulesHash: RULES_HASH, markets: MARKETS, tf: "1h", zone: 2, data: "Binance spot" },
      lastRun: runs[0] ?? null, cursor: cur, score: scorecard(T), filters: f, counts: tradeCounts(T, f), total: rowsX.length, trades: rowsX.slice(0, 500).map((t) => t.status === "open" && live[t.market] ? { ...t, now: live[t.market].px, ur: unrealR(t, live[t.market].px) } : t), live, events: ev, today: today(T, lim), shadow, at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(502).json({ configured: true, error: "Database unavailable right now." });
  }
}
