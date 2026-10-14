// v3.0 forward-test scorecard (plain JS: used by api/forward.js and the UI). Live stats only; rules in docs/FORWARD_SPEC.md.
export const FIRST_READ = 30, DECISION = 100, DAILY_LIMIT_R = -3;
// two-sided 95% Student-t critical values; n-1 degrees of freedom
const T95 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98 };
export function tCrit(df) { if (df < 1) return NaN; const ks = Object.keys(T95).map(Number); const k = ks.filter((x) => x <= df).pop(); return df > 120 ? 1.96 : T95[k]; }
/** Mean ± t·s/√n. Needs ≥ 2 values. */
export function meanCI(xs) {
  const n = xs.length; if (!n) return { mean: null, lo: null, hi: null }; const m = xs.reduce((a, x) => a + x, 0) / n; if (n < 2) return { mean: m, lo: null, hi: null };
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)); const h = (tCrit(n - 1) * sd) / Math.sqrt(n); return { mean: m, lo: m - h, hi: m + h };
}
/** Max drawdown of the cumulative R curve, as a negative number (0 = none). */
export function maxDdR(rs) { let c = 0, pk = 0, dd = 0; for (const r of rs) { c += r; pk = Math.max(pk, c); dd = Math.min(dd, c - pk); } return dd; }
/** Pre-set rules from the spec (drawdown is a stat only; the −3R limit is a daily pause, not a kill). */
export function verdict(n, ci) {
  if (n >= FIRST_READ && ci.hi != null && ci.hi < 0) return { key: "kill", label: "Kill", why: "Upper 95% CI of expectancy is below 0" };
  if (n >= DECISION && ci.lo != null && ci.lo > 0) return { key: "promote", label: "Promote", why: "Lower 95% CI of expectancy is above 0 at 100+ trades" };
  if (n >= DECISION) return { key: "nodecision", label: "No edge shown", why: "100+ trades and the CI still includes 0" };
  if (n >= FIRST_READ) return { key: "firstread", label: "First read", why: "30+ trades; not killed, keep running to 100" };
  return { key: "collecting", label: "Collecting", why: `${FIRST_READ - n} more closed trades to a first read` };
}
const num = (x) => (x == null ? null : Number(x));
export function scorecard(trades) {
  const T = trades.map((t) => ({ ...t, r_net: num(t.r_net), exit_t: num(t.exit_t), fill_t: num(t.fill_t) }));
  const closed = T.filter((t) => t.status === "closed").sort((a, b) => a.exit_t - b.exit_t); const rs = closed.map((t) => t.r_net);
  const c = (s) => T.filter((t) => t.status === s).length; const filled = closed.length + c("open"); const noTrade = c("cancelled") + c("expired");
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0); const gw = wins.reduce((a, x) => a + x, 0), gl = -losses.reduce((a, x) => a + x, 0);
  const ci = meanCI(rs); const dd = maxDdR(rs); let cum = 0;
  return { n: closed.length, pending: c("pending"), open: c("open"), cancelled: c("cancelled"), expired: c("expired"), filled,
    fillRate: filled + noTrade ? filled / (filled + noTrade) : null, winRate: rs.length ? wins.length / rs.length : null,
    expR: ci.mean, ciLo: ci.lo, ciHi: ci.hi, pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, maxDdR: dd, totalR: rs.reduce((a, x) => a + x, 0),
    progress: { firstRead: FIRST_READ, decision: DECISION }, verdict: verdict(closed.length, ci), equity: closed.map((t) => ({ t: t.exit_t, r: +(cum += t.r_net).toFixed(4) })) };
}
export const TABS = [{ key: "filled", label: "Filled" }, { key: "notfilled", label: "Not filled" }, { key: "cancelled", label: "Cancelled" }, { key: "expired", label: "Expired" }, { key: "all", label: "All" }];
export const tabOf = (t) => (t.status === "open" || t.status === "closed" ? "filled" : t.status === "pending" ? "notfilled" : t.status);
/** Trade-list status shown in the table and used by the Status header filter. */
export const tstatus = (t) => (t.status === "closed" ? (t.exit_reason === "tp" ? "tp" : "sl") : t.status);
export const TSTATUS = [["pending", "Pending order"], ["open", "Open"], ["tp", "TP"], ["sl", "SL"], ["cancelled", "Cancelled"], ["expired", "Expired"]];
const list = (v) => (v == null || v === "" ? [] : String(v).split(",").map((x) => x.trim()).filter(Boolean));
/** Display ID for a trade row: fwd_trades.id as "F-12". */
export const tradeId = (t) => (t?.id == null ? "" : `F-${t.id}`);
/** Parse a search like "12", "F-12", "f12", "#12" into the numeric id string, or "" if not an id. */
export const parseTradeId = (v) => { const m = /^\s*#?\s*(?:f\s*-?\s*)?(\d+)\s*$/i.exec(String(v ?? "")); return m ? String(Number(m[1])) : ""; };
export function parseTradeFilters(q = {}) { return { tab: TABS.some((t) => t.key === q.tab) ? q.tab : "all", market: list(q.market), side: list(q.side), status: list(q.status), id: parseTradeId(q.id) }; }
export function filterTrades(T, f, skip) {
  return T.filter((t) => (skip === "tab" || f.tab === "all" || tabOf(t) === f.tab) && (skip === "market" || !f.market.length || f.market.includes(t.market))
    && (skip === "side" || !f.side.length || f.side.includes(t.side)) && (skip === "status" || !f.status.length || f.status.includes(tstatus(t))) && (!f.id || String(t.id) === f.id));
}
export function tradeCounts(T, f) {
  const cnt = (dim, val) => { const o = {}; for (const t of filterTrades(T, f, dim)) { const k = val(t); o[k] = (o[k] ?? 0) + 1; } return o; };
  return { tab: { ...cnt("tab", tabOf), all: filterTrades(T, f, "tab").length }, market: cnt("market", (t) => t.market), side: cnt("side", (t) => t.side), status: cnt("status", tstatus) };
}
const H = ["id", "strategy", "rules_hash", "market", "side", "status", "placed_wib", "entry", "sl", "tp", "risk", "replaced", "fill_wib", "exit_wib", "exit_px", "exit_reason", "bars", "r_gross", "cost_r", "funding_r", "funding_src", "r_net", "mfe_r", "mae_r"];
const wib = (t) => (t == null ? "" : new Date(Number(t) + 7 * 3.6e6).toISOString().slice(0, 16).replace("T", " "));
const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function tradesCsv(T) {
  return [H.join(","), ...T.map((t) => [tradeId(t), t.strategy, t.rules_hash, t.market, t.side, tstatus(t), wib(t.placed_t), t.entry, t.sl, t.tp, t.risk, t.replaced, wib(t.fill_t), wib(t.exit_t), t.exit_px, t.exit_reason,
    t.bars, ...["r_gross", "cost_r", "funding_r"].map((k) => (t[k] == null ? "" : Number(t[k]).toFixed(4))), t.funding_src, t.r_net == null ? "" : Number(t.r_net).toFixed(4), t.mfe == null ? "" : Number(t.mfe).toFixed(4), t.mae == null ? "" : Number(t.mae).toFixed(4)].map(cell).join(","))].join("\n") + "\n";
}
/** Mirrors STRATEGY / rulesHash() in trader.ts (a test keeps them in sync). */
export const STRATEGY_ID = "bn-1h-z2-v1", STRATEGY_NAME = "Binance 1H Zone 2", RULES_HASH = "b81ceeeb", MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
/** Today's realized R and daily-limit status per market (WIB day). */
export function today(T, limits, now = Date.now()) {
  const key = new Date(now + 7 * 3.6e6).toISOString().slice(0, 10); const d0 = Date.parse(key + "T00:00:00+07:00"); const inDay = (t) => t != null && Number(t) >= d0 && Number(t) < d0 + 864e5 // half-open [00:00, next 00:00) WIB, same as the trader;
  return Object.fromEntries(MARKETS.map((m) => { const r = T.filter((t) => t.market === m && t.status === "closed" && inDay(t.exit_t)).reduce((a, t) => a + Number(t.r_net), 0);
    return [m, { r, hit: limits.some((e) => e.market === m && inDay(e.t)), limit: DAILY_LIMIT_R }]; }));
}
