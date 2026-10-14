// Forward test core: pure functions shared by the scheduled job (scripts/forward.ts) and tests.
// Uses the exact same scan engine as the app (src/engine/scan.ts).
import type { Candle } from "../engine/indicators";
import { scan, roundSetup, analyze, MIN_CANDLES, type Setup } from "../engine/scan";
import { DEFAULTS, sanitize, type Settings } from "../engine/settings";
import { mmrFor } from "../engine/liq";
import { feeFor, roundTick, TF_MS, type TF } from "../api/markets";

export type Venue = "hyperliquid" | "bulk";
export const FWD_VENUES: Venue[] = ["hyperliquid", "bulk"];
export const FWD_SYMBOLS = ["BTC", "ETH", "SOL"] as const;
/** Venue symbol for a base asset. */
export const venueSym = (v: Venue, base: string) => (v === "bulk" ? `${base}-USD` : base);
export const FWD_TFS: TF[] = ["1h", "4h"];
export const WINDOW = 400; // candles fed to the scan, same as the app
export const FILL_BARS = 24;
/** Today's "Signal default" strategy (same as BUILTINS[0].settings). */
export const fwdSettings = (): Settings => sanitize(DEFAULTS);
/** Short, stable hash of the settings (FNV-1a over sorted JSON). */
export function settingsHash(s: Settings): string {
  const norm = (v: any): any => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
  let h = 0x811c9dc5; for (const ch of JSON.stringify(norm(s))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return "v1-" + h.toString(16).padStart(8, "0");
}
export type Snap = { key: string; venue: Venue; candle_t: number; close_t: number; symbol: string; tf: TF; side: "long" | "short"; conf_band: string; conf_pct: number; others_agree: number; others_total: number; structure_ok: boolean;
  signals: string[]; zone: number; entry_top: number; entry_bottom: number; entry_mid: number; sl: number; tp1: number; tp2: number; settings_hash: string; atr: number; rules: string };
export const closedOnly = (c: Candle[], tf: TF, now = Date.now()) => c.filter((k) => k.t + TF_MS[tf] <= now);
/** Setups that pass the default rule on the candle at index i (closed candles only). */
export function snapshotsAt(c: Candle[], i: number, symbol: string, tf: TF, o: { venue?: Venue; settings?: Settings; maxLev?: number; tick?: number } = {}): Snap[] {
  const venue = o.venue ?? "hyperliquid";
  const s = o.settings ?? fwdSettings(); const win = c.slice(Math.max(0, i + 1 - WINDOW), i + 1); if (win.length < MIN_CANDLES) return [];
  const hash = settingsHash(s); const out: Snap[] = []; let atr: number | null = null;
  for (const side of ["long", "short"] as const) {
    let st: Setup = scan(win, side, s, { maxLev: o.maxLev, mmr: mmrFor(venue, o.maxLev), costs: { spread: 0, feePct: feeFor(venue, s) } });
    if (!st.shown) continue; if (o.tick) st = roundSetup(st, (p, m) => roundTick(p, o.tick, m));
    const t = win.at(-1)!.t; atr ??= analyze(win, s, o.maxLev, mmrFor(venue, o.maxLev)).atr;
    st.zones.forEach((z) => out.push({ key: `${venue}|${symbol}|${tf}|${t}|${side}|${z.rank}|${hash}`, venue, candle_t: t, close_t: t + TF_MS[tf], symbol, tf, side, conf_band: st.band, conf_pct: st.confidence, others_agree: st.othersAgree, others_total: st.othersTotal, structure_ok: st.structureOk,
      signals: st.signals.filter((g) => g.pass && g.weight > 0).map((g) => g.key), zone: z.rank, entry_top: z.top, entry_bottom: z.bottom, entry_mid: z.entry, sl: z.stop, tp1: z.t1, tp2: z.t2, settings_hash: hash, atr: atr!, rules: RULES }));
  }
  return out;
}
/** Rules version written on new snapshots (see version.js). */
export const RULES = "v3";
/** A new snapshot repeats the previous one for its key when entry midpoint and stop each moved ≤ this × ATR. */
export const DEDUPE_ATR = 0.25;
export function isRepeat(prev: { entry_mid: number; sl: number; status: string | null; candle_t?: number } | undefined, s: { entry_mid: number; sl: number; atr: number; candle_t?: number; tf?: TF }): boolean {
  if (!prev || (prev.status != null && FINAL.includes(prev.status as Status))) return false;
  // not resolved yet (e.g. inserted earlier in the same catch-up run) but already past the fill window → it expired
  if ((prev.status == null || prev.status === "pending") && prev.candle_t != null && s.candle_t != null && s.tf && s.candle_t - prev.candle_t >= FILL_BARS * TF_MS[s.tf]) return false;
  const tol = DEDUPE_ATR * s.atr; return Math.abs(s.entry_mid - prev.entry_mid) <= tol && Math.abs(s.sl - prev.sl) <= tol;
}
export type Status = "pending" | "expired" | "open" | "tp1_open" | "tp1" | "tp2" | "sl";
export const FINAL: Status[] = ["expired", "tp1", "tp2", "sl"];
export type Res = { status: Status; fill_t: number | null; tp1_t: number | null; done_t: number | null; bars: number };
/** Walk closed candles after the snapshot candle. Fill = price touches the entry zone within 24 bars. Same-bar SL and TP counts as SL. */
export function resolveSnap(sn: Pick<Snap, "candle_t" | "side" | "entry_top" | "entry_bottom" | "sl" | "tp1" | "tp2">, after: Candle[]): Res {
  const L = sn.side === "long"; const c = after.filter((k) => k.t > sn.candle_t).sort((a, b) => a.t - b.t);
  const hitSL = (k: Candle) => (L ? k.l <= sn.sl : k.h >= sn.sl), hit1 = (k: Candle) => (L ? k.h >= sn.tp1 : k.l <= sn.tp1), hit2 = (k: Candle) => (L ? k.h >= sn.tp2 : k.l <= sn.tp2);
  const touch = (k: Candle) => (L ? k.l <= sn.entry_top : k.h >= sn.entry_bottom);
  let fill: number | null = null, tp1: number | null = null;
  for (let j = 0; j < c.length; j++) { const k = c[j];
    if (fill == null) { if (j >= FILL_BARS) return { status: "expired", fill_t: null, tp1_t: null, done_t: c[FILL_BARS - 1].t, bars: j }; if (!touch(k)) continue; fill = k.t; }
    if (hitSL(k)) return { status: tp1 != null ? "tp1" : "sl", fill_t: fill, tp1_t: tp1, done_t: k.t, bars: j + 1 };
    if (tp1 == null && hit1(k)) tp1 = k.t;
    if (tp1 != null && hit2(k)) return { status: "tp2", fill_t: fill, tp1_t: tp1, done_t: k.t, bars: j + 1 };
  }
  if (fill == null) return c.length >= FILL_BARS ? { status: "expired", fill_t: null, tp1_t: null, done_t: c[FILL_BARS - 1].t, bars: c.length } : { status: "pending", fill_t: null, tp1_t: null, done_t: null, bars: c.length };
  return { status: tp1 != null ? "tp1_open" : "open", fill_t: fill, tp1_t: tp1, done_t: null, bars: c.length };
}
