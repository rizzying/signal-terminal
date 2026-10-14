// Forward-test results view, shared by /api/forward (JSON + CSV) and tests. Plain JS so the Vercel function can import it.
export const SMALL_N = 20; // fewer resolved trades than this → show counts + "small sample", never a bare %
export const FILL_BARS = 24;
export const TF_MS = { "15m": 9e5, "1h": 3.6e6, "4h": 1.44e7, "1d": 8.64e7 };
export const FEE_PCT = { hyperliquid: 0.045, bulk: 0.05 }; // taker per side, same as the app's defaults
export const base = (sym) => String(sym).replace(/-USD$/, "");
/** pending → waiting, open → running, tp1/tp1_open/tp2 → win (TP1 reached; all-in on TP1), sl → loss, expired → expired */
export const outcome = (st) => (st === "tp1" || st === "tp1_open" || st === "tp2" ? "win" : st === "sl" ? "loss" : st === "expired" ? "expired" : st === "open" ? "running" : "waiting");
const num = (x) => (x == null ? null : Number(x));
/** R net of fees for a finished trade (win at TP1 or loss at stop), null otherwise. */
export function rNet(r) {
  const o = outcome(r.status); if (o !== "win" && o !== "loss") return null;
  const mid = num(r.entry_mid) ?? (num(r.entry_top) + num(r.entry_bottom)) / 2; const R = Math.abs(mid - num(r.sl)); if (!R) return null; const f = (FEE_PCT[r.venue] ?? 0.05) / 100;
  return o === "win" ? (Math.abs(num(r.tp1) - mid) - f * (mid + num(r.tp1))) / R : -(R + f * (mid + num(r.sl))) / R;
}
const keyOf = (r) => `${r.version}|${r.venue}|${r.symbol}|${r.tf}|${r.side}|${r.zone}`;
/** Hide rows that repeat the previous visible row for the same key: entry edges within 0.25 ATR, previous not yet resolved/expired at that time.
 *  Rows are never deleted; this only hides older v3 repeats (stop drift) from stats, cards and CSV. Rows without an ATR (v1/v2) are kept as-is. */
export function hideRepeats(rows) {
  const last = new Map(); const out = [];
  for (const r of [...rows].sort((a, b) => num(a.candle_t) - num(b.candle_t) || num(a.id ?? 0) - num(b.id ?? 0))) {
    const k = keyOf(r); const p = last.get(k); const atr = num(r.atr) ?? num(p?.atr);
    const live = p && (p.done_t == null || num(p.done_t) > num(r.candle_t)) && !(p.fill_t == null && num(r.candle_t) - num(p.candle_t) >= FILL_BARS * (TF_MS[r.tf] ?? 3.6e6));
    if (p && atr && live && Math.abs(num(r.entry_top) - num(p.entry_top)) <= 0.25 * atr && Math.abs(num(r.entry_bottom) - num(p.entry_bottom)) <= 0.25 * atr) continue;
    last.set(k, r); out.push(r);
  }
  return out;
}
const dayWib = (t) => new Date(num(t) + 7 * 3600e3).toISOString().slice(0, 10);
/** Filters from a query object: venue, symbol (base), tf, side, zone, status (waiting|running|win|loss|expired), from/to (YYYY-MM-DD, WIB). */
export function parseFilters(q = {}) {
  const pick = (k, ok) => (q[k] && ok(String(q[k])) ? String(q[k]) : undefined); const d = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  return { venue: pick("venue", (s) => s in FEE_PCT), symbol: pick("symbol", (s) => /^[A-Z0-9]{1,15}$/.test(s)), tf: pick("tf", (s) => s in TF_MS), side: pick("side", (s) => s === "long" || s === "short"),
    zone: pick("zone", (s) => /^[123]$/.test(s)), status: pick("status", (s) => ["waiting", "running", "win", "loss", "expired"].includes(s)), from: pick("from", d), to: pick("to", d) };
}
export function filterRows(rows, f) {
  return rows.filter((r) => (!f.venue || r.venue === f.venue) && (!f.symbol || base(r.symbol) === f.symbol) && (!f.tf || r.tf === f.tf) && (!f.side || r.side === f.side) && (!f.zone || String(r.zone) === f.zone)
    && (!f.status || outcome(r.status) === f.status) && (!f.from || dayWib(r.close_t) >= f.from) && (!f.to || dayWib(r.close_t) <= f.to));
}
export function score(rows) {
  const c = { n: rows.length, waiting: 0, running: 0, win: 0, loss: 0, expired: 0 }; let sumR = 0, nR = 0;
  for (const r of rows) { c[outcome(r.status)]++; const x = rNet(r); if (x != null) { sumR += x; nR++; } }
  const resolved = c.win + c.loss, filled = c.running + resolved;
  return { ...c, resolved, filled, winRate: resolved ? c.win / resolved : null, avgR: nR ? sumR / nR : null, expiredPct: filled + c.expired ? c.expired / (filled + c.expired) : null, small: resolved < SMALL_N };
}
export const DIMS = { zone: (r) => `Z${r.zone}`, tf: (r) => r.tf, venue: (r) => r.venue, side: (r) => r.side, symbol: (r) => base(r.symbol) };
export function breakdown(rows, dim) {
  const g = new Map(); for (const r of rows) { const k = DIMS[dim](r); (g.get(k) ?? g.set(k, []).get(k)).push(r); }
  return [...g].map(([key, rs]) => ({ key, ...score(rs) })).sort((a, b) => b.n - a.n || String(a.key).localeCompare(String(b.key)));
}
/** One card per snapshot (venue+symbol+TF+side+candle), zones inside, newest first. */
export function setups(rows, limit = 40) {
  const g = new Map();
  for (const r of rows) { const k = `${r.venue}|${r.symbol}|${r.tf}|${r.side}|${r.candle_t}`; let s = g.get(k);
    if (!s) g.set(k, (s = { venue: r.venue, symbol: r.symbol, tf: r.tf, side: r.side, candle_t: num(r.candle_t), close_t: num(r.close_t), version: r.version, conf_band: r.conf_band, conf_pct: r.conf_pct, px: num(r.px), atr: num(r.atr), zones: [] }));
    s.zones.push({ zone: r.zone, entry_bottom: num(r.entry_bottom), entry_top: num(r.entry_top), sl: num(r.sl), tp1: num(r.tp1), tp2: num(r.tp2), rr: Math.abs(num(r.tp1) - num(r.entry_mid)) / (Math.abs(num(r.entry_mid) - num(r.sl)) || 1), status: r.status, outcome: outcome(r.status), rNet: rNet(r), done_t: num(r.done_t), bars: num(r.bars) }); }
  return [...g.values()].map((s) => ({ ...s, zones: s.zones.sort((a, b) => a.zone - b.zone) })).sort((a, b) => b.close_t - a.close_t).slice(0, limit);
}
export function facets(rows) { const u = (f) => [...new Set(rows.map(f))].sort(); return { venue: u((r) => r.venue), symbol: u((r) => base(r.symbol)), tf: Object.keys(TF_MS).filter((t) => rows.some((r) => r.tf === t)) }; }
/** Live progress for a waiting zone: distance from price to the zone (% and ATR, 0 when inside), trend vs a reference price, bars left before expiry. */
export function progress(z, s, px, now, refPx, barsDone = 0) {
  const long = s.side === "long"; const inside = px >= z.entry_bottom && px <= z.entry_top;
  const gap = inside ? 0 : long ? px - z.entry_top : z.entry_bottom - px; // >0: price still has to travel to the zone
  const ref = refPx ?? s.px; const gapRef = ref == null ? null : long ? ref - z.entry_top : z.entry_bottom - ref;
  const trend = gapRef == null || inside ? null : Math.abs(gap - gapRef) < 1e-12 ? "flat" : gap < gapRef ? "approaching" : "moving away";
  const elapsed = Math.floor((now - s.close_t) / (TF_MS[s.tf] ?? 3.6e6)); return { inside, gapPct: gap / px, gapAtr: s.atr ? gap / s.atr : null, trend, barsLeft: Math.max(0, FILL_BARS - Math.max(elapsed, barsDone ?? 0)) };
}
/** Next hourly job time label in WIB: the cron fires at :07 and usually starts by about :09. */
export function nextRunLabel(now) { const d = new Date(now + 7 * 3600e3); let h = d.getUTCHours(); if (d.getUTCMinutes() >= 9) h = (h + 1) % 24; return `~${String(h).padStart(2, "0")}:09 WIB`; }
