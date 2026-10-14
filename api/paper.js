// Vercel function: public, read-only v3.0 forward test (virtual trader). Scorecard + trade list (JSON) or CSV.
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
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="forward-${STRATEGY_ID}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(tradesCsv([...rows].sort((a, b) => Number(a.placed_t) - Number(b.placed_t))));
    }
    return res.status(200).json({ configured: true, strategy: { id: STRATEGY_ID, name: STRATEGY_NAME, rulesHash: RULES_HASH, markets: MARKETS, tf: "1h", zone: 2, data: "Binance spot" },
      lastRun: runs[0] ?? null, cursor: cur, score: scorecard(T), filters: f, counts: tradeCounts(T, f), total: rows.length, trades: rows.slice(0, 500), events: ev, today: today(T, lim), at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(502).json({ configured: true, error: "Database unavailable right now." });
  }
}
