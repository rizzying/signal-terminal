// Vercel function: public, read-only v3.0 forward test (virtual trader). Scorecard + trade list (JSON) or CSV.
import { shadowReplay, shadowSummary, unrealR, openWhatIfR } from "../src/forward/shadow.js";
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
    const rows = filterTrades(T, f);
    // What-if replay of cancelled orders (research only, not counted anywhere). Closed Binance 1H candles since the earliest cancel, per market.
    // Live price per market (last 1H candle close, incl. the forming one). Display only: unrealized R for open trades.
    const live = {}; if (q.format !== "csv") await Promise.all(MARKETS.map(async (m) => { try { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=1h&limit=1`); if (r.ok) { const k = (await r.json())[0]; if (k) live[m] = { px: +k[4], t: Date.now() }; } } catch {} }));
    let shadow = null;
    if (q.format !== "csv") try {
      const C = T.filter((t) => t.status === "cancelled" && t.exit_t != null); const now = Date.now(); const byM = {};
      await Promise.all([...new Set(C.map((t) => t.market))].map(async (m) => { let from = Math.min(...C.filter((t) => t.market === m).map((t) => Number(t.exit_t))); const K = [];
        for (let i = 0; i < 5 && from < now - 3.6e6; i++) { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=1h&startTime=${from}&limit=1000`); if (!r.ok) throw new Error("klines");
          const a = (await r.json()).map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })).filter((k) => k.t + 3.6e6 <= now); if (!a.length) break; K.push(...a); from = a.at(-1).t + 3.6e6; if (a.length < 1000) break; }
        byM[m] = K; }));
      const rowsS = C.map((t) => ({ id: String(t.id), ...shadowReplay(t, byM[t.market] ?? []) })); for (const x of rowsS) if (x.status === "open") { const t = C.find((y) => String(y.id) === x.id); x.now = live[t.market]?.px ?? null; x.ur = unrealR(t, x.now); }
      shadow = { note: "what-if, not counted", summary: { ...shadowSummary(rowsS), openR: openWhatIfR(rowsS, C, live) }, rows: Object.fromEntries(rowsS.map((x) => [x.id, x])) };
    } catch { shadow = { note: "what-if, not counted", error: "Couldn't load Binance candles for the check right now." }; }
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="forward-${STRATEGY_ID}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(tradesCsv([...rows].sort((a, b) => Number(a.placed_t) - Number(b.placed_t))));
    }
    return res.status(200).json({ configured: true, strategy: { id: STRATEGY_ID, name: STRATEGY_NAME, rulesHash: RULES_HASH, markets: MARKETS, tf: "1h", zone: 2, data: "Binance spot" },
      lastRun: runs[0] ?? null, cursor: cur, score: scorecard(T), filters: f, counts: tradeCounts(T, f), total: rows.length, trades: rows.slice(0, 500).map((t) => t.status === "open" && live[t.market] ? { ...t, now: live[t.market].px, ur: unrealR(t, live[t.market].px) } : t), live, events: ev, today: today(T, lim), shadow, at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(502).json({ configured: true, error: "Database unavailable right now." });
  }
}
