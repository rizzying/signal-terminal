// Vercel function: public, read-only forward test. Per-scorecard stats (headline first) + trade list, or CSV.
import { shadowReplay, shadowSummary, unrealR, openWhatIfR, excursion, mergeExc, shownExc } from "../src/forward/shadow.js";
import { neon } from "@neondatabase/serverless";
import { scoreboards, combinedBoard, parseTradeFilters, filterTrades, tradeCounts, tradesCsv, todayByBook, STRATEGY_ID, STRATEGY_NAME, RULES_HASH, MARKETS, reportBooks } from "../src/forward/paper.js";
import { TF_MS, TF_INTERVAL, bookOf } from "../src/forward/books.js";
export const config = { maxDuration: 20 };
const riskParam = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1e7 ? n : 100; };
const tfOf = (t) => bookOf(t.strategy)?.tf ?? "1h";
const ph = (ids, from = 1) => ids.map((_, i) => `$${i + from}`).join(",");
export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) { res.setHeader("Cache-Control", "s-maxage=60"); return res.status(200).json({ configured: false }); }
  try {
    const sql = neon(url); const q = req.query ?? {}; const f = parseTradeFilters(q);
    const ids = reportBooks().map((b) => b.id);
    const has = (await sql.query(`select 1 from information_schema.tables where table_name = 'fwd_trades'`)).length > 0;
    const [T, runs, cur, ev, lim] = has ? await Promise.all([
      sql.query(`select * from fwd_trades where strategy in (${ph(ids)}) order by placed_t desc, id desc limit 20000`, ids),
      sql.query(`select at, paper, (errors is not null) as had_errors from fwd_runs order by id desc limit 1`),
      sql.query(`select strategy, market, last_t from fwd_trader where strategy in (${ph(ids)}) order by strategy, market`, ids),
      sql.query(`select strategy, market, trade_key, kind, t, data from fwd_events where strategy in (${ph(ids)}) order by t desc, id desc limit 80`, ids),
      sql.query(`select strategy, market, t from fwd_events where strategy in (${ph(ids)}) and kind = 'limit' and t > $${ids.length + 1}`, [...ids, Date.now() - 2 * 864e5]),
    ]) : [[], [], [], [], []];
    const boards = scoreboards(T); const headline = boards.find((b) => b.headline) ?? boards[0];
    const shown = reportBooks().filter((m) => (!f.zone || String(m.zone) === f.zone) && (!f.tf || m.tf === f.tf));
    const combined = combinedBoard(T, shown);
    const now = Date.now(); const need = new Map();
    for (const t of T) {
      const key = `${t.market}|${tfOf(t)}`;
      if (t.status === "cancelled" && t.exit_t != null) need.set(key, Math.min(need.get(key) ?? Infinity, Number(t.exit_t)));
      if (t.fill_t != null) need.set(key, Math.min(need.get(key) ?? Infinity, Number(t.fill_t)));
    }
    const live = {}; let byM = {}, kErr = false;
    const openKeys = [...new Set(T.filter((t) => t.status === "open").map((t) => `${t.market}|${tfOf(t)}`))];
    await Promise.all(openKeys.map(async (key) => { const [m, tf] = key.split("|"); try {
      const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=${TF_INTERVAL[tf]}&limit=1`);
      if (r.ok) { const k = (await r.json())[0]; if (k) live[key] = { px: +k[4], t: Date.now(), k: { t: k[0], h: +k[2], l: +k[3] } }; }
    } catch { /* display only */ } }));
    try { await Promise.all([...need.entries()].map(async ([key, from]) => { const [m, tf] = key.split("|"); const bar = TF_MS[tf]; const K = [];
      for (let i = 0; i < 5 && from < now - bar; i++) { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=${TF_INTERVAL[tf]}&startTime=${from}&limit=1000`); if (!r.ok) throw new Error("klines");
        const a = (await r.json()).map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })).filter((k) => k.t + bar <= now); if (!a.length) break; K.push(...a); from = a.at(-1).t + bar; if (a.length < 1000) break; }
      byM[key] = K; })); } catch { kErr = true; byM = {}; }
    const pack = (t) => byM[`${t.market}|${tfOf(t)}`] ?? [];
    const exc = (t, fillT, exitT) => kErr ? { mfe: null, mae: null } : excursion(t, pack(t), fillT, exitT, exitT == null ? live[`${t.market}|${tfOf(t)}`]?.k : undefined);
    const T2 = T.map((t) => t.fill_t == null ? t : { ...t, ...shownExc(t, mergeExc(t, exc(t, t.fill_t, t.status === "open" ? null : t.exit_t))) });
    let shadow = null;
    if (q.format !== "csv") { if (kErr) shadow = { note: "what-if, not counted", error: "Couldn't load Binance candles for the check right now." }; else {
      const C = T.filter((t) => t.status === "cancelled" && t.exit_t != null);
      const rowsS = C.map((t) => { const x = { id: String(t.id), ...shadowReplay(t, pack(t), TF_MS[tfOf(t)]) }; return { ...x, ...exc(t, x.fill_t, x.status === "open" ? null : x.exit_t) }; });
      for (const x of rowsS) if (x.status === "open") { const t = C.find((y) => String(y.id) === x.id); x.now = live[`${t.market}|${tfOf(t)}`]?.px ?? null; x.ur = unrealR(t, x.now); }
      shadow = { note: "what-if, not counted", summary: { ...shadowSummary(rowsS), openR: openWhatIfR(rowsS, C, Object.fromEntries(C.map((t) => [t.market, live[`${t.market}|${tfOf(t)}`]]))) }, rows: Object.fromEntries(rowsS.map((x) => [x.id, x])) }; } }
    const rowsX = filterTrades(T2, f);
    const withNow = (t) => { const px = live[`${t.market}|${tfOf(t)}`]; return t.status === "open" && px ? { ...t, now: px.px, ur: unrealR(t, px.px) } : t; };
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
    if (q.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="forward-${STRATEGY_ID}-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(tradesCsv([...rowsX].sort((a, b) => Number(a.placed_t) - Number(b.placed_t)), riskParam(q.risk)));
    }
    return res.status(200).json({ configured: true, strategy: { id: STRATEGY_ID, name: STRATEGY_NAME, rulesHash: RULES_HASH, markets: MARKETS, tf: "1h", zone: 2, data: "Binance spot" },
      lastRun: runs[0] ?? null, cursor: cur, score: headline?.score ?? null, scorecards: boards, combined, filters: f, counts: tradeCounts(T, f), total: rowsX.length,
      trades: rowsX.slice(0, 500).map(withNow), live, events: ev, today: todayByBook(T, lim), shadow, at: Date.now() });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.status(502).json({ configured: true, error: "Database unavailable right now." });
  }
}
