// Vercel function: public, read-only forward-test results (aggregated counts). Cached at the edge.
import { neon } from "@neondatabase/serverless";
export const config = { maxDuration: 15 };
export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ configured: false }); }
  try {
    const sql = neon(url);
    const [groups, runs, recent, span] = await Promise.all([
      sql.query(`select s.venue, s.symbol, s.tf, s.zone, s.conf_band, s.side, coalesce(r.status, 'pending') as status, count(*)::int as n
        from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id group by 1,2,3,4,5,6,7`),
      sql.query(`select at, inserted, resolved, (errors is not null) as had_errors from fwd_runs order by id desc limit 1`),
      sql.query(`select s.venue, s.symbol, s.tf, s.side, s.zone, s.conf_band, s.conf_pct, s.close_t, s.entry_bottom, s.entry_top, s.sl, s.tp1, s.tp2, coalesce(r.status, 'pending') as status
        from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id order by s.close_t desc, s.id desc limit 12`),
      sql.query(`select venue, min(close_t)::bigint as first, count(distinct (symbol, tf, candle_t))::int as candles from fwd_snapshots group by venue`),
    ]);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({ configured: true, lastRun: runs[0] ?? null, groups, recent, span, at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    const msg = String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://***");
    return res.status(502).json({ configured: true, error: msg.includes("does not exist") ? "No data yet: the first scheduled run hasn't happened." : "Database unavailable right now." });
  }
}
