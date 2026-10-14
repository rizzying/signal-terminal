// Vercel function: public, read-only forward-test results (aggregated counts). Cached at the edge.
import { neon } from "@neondatabase/serverless";
import { toCsv, csvFilename, CSV_CAP } from "../src/forward/csv.js";
import { VERSION_SQL, parseVersion } from "../src/forward/version.js";
export const config = { maxDuration: 15 };
export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ configured: false }); }
  try {
    const sql = neon(url); const ver = parseVersion(req.query?.v); const W = `(${VERSION_SQL} = $1 or $1 = 'all')`;
    const hasRules = (await sql.query(`select 1 from information_schema.columns where table_name = 'fwd_snapshots' and column_name = 'rules'`)).length > 0;
    const V = hasRules ? VERSION_SQL : VERSION_SQL.replace("coalesce(s.rules, ", "(").replace(/\)$/, ")"); const WV = W.replace(VERSION_SQL, V);
    if (req.query?.format === "csv") { // read-only export, every snapshot (capped), newest last
      const rows = await sql.query(`select s.venue, s.symbol, s.tf, s.side, s.zone, s.conf_band, s.conf_pct, s.close_t, s.entry_bottom, s.entry_top, s.entry_mid, s.sl, s.tp1, s.tp2, s.settings_hash, ${V} as version,
        coalesce(r.status, 'pending') as status, r.done_t, r.bars from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id where ${WV} order by s.close_t, s.id limit ${CSV_CAP}`, [ver]);
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${csvFilename(Date.now(), ver)}"`);
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600"); if (rows.length >= CSV_CAP) res.setHeader("X-Row-Cap", String(CSV_CAP));
      return res.status(200).send(toCsv(rows));
    }
    const [groups, runs, recent, versions, span] = await Promise.all([
      sql.query(`select s.venue, s.symbol, s.tf, s.zone, s.conf_band, s.side, coalesce(r.status, 'pending') as status, count(*)::int as n
        from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id where ${WV} group by 1,2,3,4,5,6,7`, [ver]),
      sql.query(`select at, inserted, resolved, (errors is not null) as had_errors from fwd_runs order by id desc limit 1`),
      sql.query(`select s.venue, s.symbol, s.tf, s.side, s.zone, s.conf_band, s.conf_pct, s.close_t, s.entry_bottom, s.entry_top, s.sl, s.tp1, s.tp2, coalesce(r.status, 'pending') as status
        from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id where ${WV} order by s.close_t desc, s.id desc limit 12`, [ver]),
      sql.query(`select ${V} as version, count(*)::int as n, min(s.created_at) as first from fwd_snapshots s group by 1 order by 1 desc`),
      sql.query(`select venue, min(close_t)::bigint as first, count(distinct (symbol, tf, candle_t))::int as candles from fwd_snapshots s where ${WV} group by venue`, [ver]),
    ]);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json({ configured: true, lastRun: runs[0] ?? null, groups, recent, span, version: ver, versions, at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    const msg = String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://***");
    return res.status(502).json({ configured: true, error: msg.includes("does not exist") ? "No data yet: the first scheduled run hasn't happened." : "Database unavailable right now." });
  }
}
