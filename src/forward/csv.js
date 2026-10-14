import { rNet } from "./view.js";
import { LATEST } from "./version.js";
// CSV export for the forward test (shared by /api/forward?format=csv and tests). Plain JS so the Vercel function can import it.
export const CSV_CAP = 50000;
export const CSV_COLS = ["rules_version", "snapshot_time_wib", "snapshot_time_utc", "venue", "symbol", "timeframe", "side", "zone", "entry_low", "entry_high", "stop", "tp1", "tp2", "rr_tp1", "confidence_pct", "confidence_band", "settings_hash", "outcome", "resolved_time_wib", "resolved_time_utc", "bars_to_resolve", "r_net"];
const OUT = { pending: "pending", open: "pending", tp1_open: "TP1", tp1: "TP1", tp2: "TP2", sl: "SL", expired: "expired" };
export const outcome = (s) => OUT[s] ?? "pending";
const pad = (n) => String(n).padStart(2, "0");
const iso = (t) => (t == null ? "" : new Date(Number(t)).toISOString().replace(/\.\d{3}Z$/, "Z"));
const wib = (t) => { if (t == null) return ""; const d = new Date(Number(t) + 7 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} WIB`; };
const cell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `"${s.replace(/"/g, '""')}"` : s; };
export function csvFilename(now, ver) { const d = new Date(Number(now) + 7 * 3600e3); return `signal-forward-${ver && ver !== LATEST ? ver + "-" : ""}${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.csv`; }
/** rows: fwd_snapshots joined with fwd_results (status, done_t, bars). One CSV row per snapshot. */
export function toCsv(rows) {
  const out = [CSV_COLS.join(",")];
  for (const r of rows) {
    const st = r.status ?? "pending"; const o = outcome(st); const done = o === "pending" ? null : r.done_t ?? null;
    const mid = Number(r.entry_mid ?? (Number(r.entry_top) + Number(r.entry_bottom)) / 2); const risk = Math.abs(mid - Number(r.sl)); const rr = risk ? Math.abs(Number(r.tp1) - mid) / risk : null;
    out.push([r.version ?? "", wib(r.close_t), iso(r.close_t), r.venue, r.symbol, r.tf, r.side, r.zone, r.entry_bottom, r.entry_top, r.sl, r.tp1, r.tp2, rr == null ? "" : rr.toFixed(2), r.conf_pct, r.conf_band, r.settings_hash, o, wib(done), iso(done), o === "pending" ? "" : r.bars, (() => { const x = rNet(r); return x == null ? "" : x.toFixed(3); })()].map(cell).join(","));
  }
  return out.join("\r\n") + "\r\n";
}
