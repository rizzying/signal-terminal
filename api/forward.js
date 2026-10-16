// Vercel function: public, read-only forward-test results. Filters + scoreboard + setup cards (JSON) or CSV. Cached at the edge.
import { neon } from "@neondatabase/serverless";
import { toCsv, csvFilename, CSV_CAP } from "../src/forward/csv.js";
import { VERSION_SQL, parseVersion } from "../src/forward/version.js";
import { hideRepeats, parseFilters, filterRows, score, breakdown, setups, facets, DIMS, fillCounts, zoneRows, filterCounts } from "../src/forward/view.js";
import { scoreboards, reportBooks } from "../src/forward/paper.js";
export const config = { maxDuration: 20 };
/** Paper scorecards (headline first). Missing table or a read error leaves the snapshot log alone. */
async function paperBoards(sql) {
  try {
    const has = (await sql.query(`select 1 from information_schema.tables where table_name = 'fwd_trades'`)).length > 0;
    if (!has) return [];
    const ids = reportBooks().map((b) => b.id);
    const T = await sql.query(`select strategy, rules_hash, status, exit_reason, exit_t, fill_t, r_net from fwd_trades where strategy in (${ids.map((_, i) => `$${i + 1}`).join(",")})`, ids);
    return scoreboards(T);
  } catch { return []; }
}
export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ configured: false }); }
  try {
    const sql = neon(url); const q = req.query ?? {}; const ver = parseVersion(q.v); const f = parseFilters(q);
    const hasRules = (await sql.query(`select 1 from information_schema.columns where table_name = 'fwd_snapshots' and column_name = 'rules'`)).length > 0;
    const V = hasRules ? VERSION_SQL : VERSION_SQL.replace("coalesce(s.rules, ", "(");
    const [raw, runs, versions] = await Promise.all([
      sql.query(`select s.*, ${V} as version, coalesce(r.status, 'pending') as status, r.fill_t, r.done_t, r.bars from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id
        where (${V} = $1 or $1 = 'all') order by s.close_t desc, s.id desc limit ${CSV_CAP}`, [ver]),
      sql.query(`select at, inserted, resolved, (errors is not null) as had_errors from fwd_runs order by id desc limit 1`),
      sql.query(`select ${V} as version, count(*)::int as n from fwd_snapshots s group by 1 order by 1 desc`),
    ]);
    const shown = hideRepeats(raw); const rows = filterRows(shown, f); const tabCounts = fillCounts(filterRows(shown, { ...f, fill: undefined })); const hidden = raw.length - shown.length;
    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${csvFilename(Date.now(), ver)}"`);
      res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600"); if (raw.length >= CSV_CAP) res.setHeader("X-Row-Cap", String(CSV_CAP));
      return res.status(200).send(toCsv([...rows].sort((a, b) => Number(a.close_t) - Number(b.close_t))));
    }
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    const scorecards = await paperBoards(sql);
    return res.status(200).json({ configured: true, lastRun: runs[0] ?? null, version: ver, versions, filters: f, hidden, total: rows.length,
      score: score(rows), scorecards, by: Object.fromEntries(Object.keys(DIMS).map((d) => [d, breakdown(rows, d)])), setups: setups(rows, 40), facets: facets(shown), tabs: tabCounts, counts: filterCounts(shown, f), zones: zoneRows(rows, q.order === "asc" ? "asc" : "desc", 300), at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    const msg = String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/g, "postgres://***");
    return res.status(502).json({ configured: true, error: msg.includes("does not exist") ? "No data yet: the first scheduled run hasn't happened." : "Database unavailable right now." });
  }
}
