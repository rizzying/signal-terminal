// "Cancelled order check" (what-if, NOT counted): replay a cancelled order with its last entry/SL/TP on closed Binance 1H candles after the cancel,
// using the trader's fill and cost rules (trade-through by max(1 tick, 0.02%), stop checked first, stop in fill candle = SL, target in fill candle not
// counted, 24-bar expiry counted from placement, stop = taker + spread + 0.05% slippage, TP = maker). Funding is left out. Research only: never
// touches fwd_trades, the scorecard, the -3R daily limit, strategy bn-1h-z2-v1 or its rules hash. A test keeps these numbers in sync with trader.ts.
export const SH = { ttlBars: 24, tradeThroughPct: 0.02, tick: 0.01, makerPct: 0.02, takerPct: 0.05, spreadPct: 0.02, stopSlipPct: 0.05 };
const H = 3.6e6;
const rt = (v, dir) => { const n = v / SH.tick; return +((dir === "down" ? Math.floor(n + 1e-9) : dir === "up" ? Math.ceil(n - 1e-9) : Math.round(n)) * SH.tick).toFixed(8); };
const buf = (px) => Math.max(SH.tick, (px * SH.tradeThroughPct) / 100);
/** t: cancelled trade row; K: closed 1H candles {t,o,h,l,c} (any range; only those after the cancel are used). */
export function shadowReplay(t, K) {
  const L = t.side === "long", entry = +t.entry, sl = +t.sl, tp = +t.tp, risk = +t.risk || Math.abs(entry - sl), cancel = Number(t.exit_t), placed = Number(t.placed_t);
  let bars = Math.round((cancel - placed) / H), fill = null;
  const settle = (px, why, exitT) => { const gross = ((L ? 1 : -1) * (px - entry)) / risk; const cost = (entry * SH.makerPct / 100 + px * (why === "tp" ? SH.makerPct : SH.takerPct + SH.spreadPct) / 100) / risk;
    return { status: why, fill_t: fill, exit_t: exitT, exit_px: px, r: gross - cost }; };
  const stopPx = (k) => rt((L ? Math.min(k.o, sl) : Math.max(k.o, sl)) * (1 - (L ? 1 : -1) * SH.stopSlipPct / 100));
  const stopHit = (k) => (L ? k.l <= sl : k.h >= sl);
  for (const k of [...K].filter((k) => k.t >= cancel).sort((a, b) => a.t - b.t)) {
    const close = k.t + H;
    if (fill == null) { bars++;
      if (L ? k.l <= entry - buf(entry) : k.h >= entry + buf(entry)) { fill = close; if (stopHit(k)) return settle(stopPx(k), "sl", close); continue; }
      if (bars >= SH.ttlBars) return { status: "expired", fill_t: null, exit_t: close, exit_px: null, r: null };
    } else {
      if (stopHit(k)) return settle(stopPx(k), "sl", close);
      if (L ? k.h >= tp + buf(tp) : k.l <= tp - buf(tp)) return settle(tp, "tp", close);
    }
  }
  return fill == null ? { status: "waiting", fill_t: null, exit_t: null, exit_px: null, r: null } : { status: "open", fill_t: fill, exit_t: null, exit_px: null, r: null };
}
export const SHADOW_LABEL = { waiting: "would still be waiting", expired: "would have expired", open: "would be open", tp: "would have hit TP", sl: "would have hit SL" };
export function shadowSummary(rows) {
  const filled = rows.filter((s) => s.fill_t != null), done = rows.filter((s) => s.r != null);
  return { cancelled: rows.length, filled: filled.length, closed: done.length, netR: done.reduce((a, s) => a + s.r, 0), open: rows.filter((s) => s.status === "open").length, pending: rows.filter((s) => s.status === "waiting").length };
}
/** Unrealized R of an open trade (real or what-if) at live price px. Gross, before exit costs. Display only. */
export function unrealR(t, px) { const entry = +t.entry, risk = +t.risk || Math.abs(entry - +t.sl); if (!(px > 0) || !(risk > 0)) return null; return ((t.side === "long" ? 1 : -1) * (px - entry)) / risk; }
export function openWhatIfR(rows, trades, live) { let sum = 0, n = 0; for (const x of rows) { if (x.status !== "open") continue; const t = trades.find((y) => String(y.id) === x.id); const r = t && unrealR(t, live?.[t.market]?.px); if (r != null) { sum += r; n++; } } return { n, r: sum }; }
/** MFE/MAE in R (research only, never used for exits/scoring). Conservative on the fill candle: it is SKIPPED, because inside one 1H candle we can't
 * tell if its high/low came before or after the fill. Uses closed 1H candles that open at/after fill_t (fill_t = fill candle close) and before exit_t
 * (exit_t = exit candle close, so the exit candle counts), or up to now for open trades. For open trades `now` is the currently-forming 1H candle
 * ({t,h,l}, its high/low so far; a bare number = last price, legacy) so the result never shrinks as the live price moves within the hour. Gross R, no costs. */
export function excursion(t, K, fillT, exitT, now) {
  if (fillT == null) return { mfe: null, mae: null }; const L = t.side === "long", entry = +t.entry, risk = +t.risk || Math.abs(entry - +t.sl); if (!(risk > 0)) return { mfe: null, mae: null };
  let best = 0, worst = 0; const f = Number(fillT), e = exitT == null ? Infinity : Number(exitT);
  const upd = (hi, lo) => { const a = ((L ? hi : lo) - entry) * (L ? 1 : -1) / risk, b = ((L ? lo : hi) - entry) * (L ? 1 : -1) / risk; best = Math.max(best, a); worst = Math.min(worst, b); };
  for (const k of K) if (k.t >= f && k.t < e) upd(k.h, k.l);
  if (exitT == null && now != null) { if (typeof now === "number") { if (now > 0) upd(now, now); }
    else if (now.h > 0 && now.l > 0 && (now.t == null || (Number(now.t) >= f && !K.some((k) => k.t === now.t)))) upd(now.h, now.l); }
  return { mfe: best, mae: worst };
}
/** Max-merge a persisted running MFE/MAE (fwd_trades.mfe_r/mae_r) with a freshly computed one, so best/worst never decrease. */
export function mergeExc(stored, x) { const n = (v) => (v == null || !Number.isFinite(+v) ? null : +v); const sm = n(stored?.mfe_r), sa = n(stored?.mae_r);
  return { mfe: x.mfe == null && sm == null ? null : Math.max(sm ?? -Infinity, x.mfe ?? -Infinity), mae: x.mae == null && sa == null ? null : Math.min(sa ?? Infinity, x.mae ?? Infinity) }; }
