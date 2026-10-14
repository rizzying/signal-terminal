// v3.0 forward test: a virtual trader per (strategy, market). Pure functions shared by the hourly job and the tests.
// Rules are frozen in docs/FORWARD_SPEC.md; changing anything here means a new strategy version (see SPEC + rulesHash).
import type { Candle } from "../engine/indicators";
import { scan, MIN_CANDLES } from "../engine/scan";
import { DEFAULTS, sanitize, type Settings } from "../engine/settings";
import { roundTick } from "../api/markets";

export type Side = "long" | "short";
/** Everything that defines the strategy. Its hash is the rules hash in the spec. */
export const SPEC = {
  id: "bn-1h-z2", name: "Binance 1H Zone 2", version: "1",
  data: "Binance spot klines (data-api.binance.vision), closed 1H candles", markets: ["BTCUSDT", "ETHUSDT", "SOLUSDT"], tf: "1h", window: 400,
  zone: 2, sides: ["long", "short"], exit: "all at TP1 (exitMode 0)", ttlBars: 24, replaceAtr: 0.1,
  fill: { tradeThroughPct: 0.02, tradeThroughTicks: 1 },
  costs: { makerPct: 0.02, takerPct: 0.05, spreadPct: 0.02, stopSlipPct: 0.05, zoneFeePct: 0.05 },
  sameCandle: "stop", funding: "Binance USDT-M perp funding; else Hyperliquid funding for the same coin (labelled proxy)",
  finish: { firstRead: 30, decision: 100 }, dailyLimitR: -3, // per trader, WIB calendar day, realized R
  settings: sanitize({ ...DEFAULTS, minRR: 3 }) as Settings, // defaults, except TP1 at 3R (rizzy, 14 Oct)
} as const;
export const TICK: Record<string, number> = { BTCUSDT: 0.01, ETHUSDT: 0.01, SOLUSDT: 0.01 };
/** FNV-1a over key-sorted JSON. */
export function rulesHash(o: unknown = SPEC): string {
  const norm = (v: any): any => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : Array.isArray(v) ? v.map(norm) : v);
  let h = 0x811c9dc5; for (const ch of JSON.stringify(norm(o))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0");
}
export const STRATEGY = `${SPEC.id}-v${SPEC.version}`;

export type Plan = { side: Side; entry: number; sl: number; tp: number; atr: number; conf: number };
export type Trade = { id?: number; market: string; side: Side; status: "pending" | "open" | "closed" | "cancelled" | "expired";
  placed_t: number; entry: number; sl: number; tp: number; risk: number; conf: number; replaced: number;
  fill_t: number | null; exit_t: number | null; exit_px: number | null; exit_reason: "tp" | "sl" | null; bars: number; r_gross: number | null; cost_r: number | null; funding_r: number | null; funding_src: string | null; r_net: number | null };
export type Ev = { kind: "place" | "replace" | "cancel" | "expire" | "fill" | "close" | "limit"; t: number; data: Record<string, unknown>; tr: Trade | null };
/** WIB calendar day (UTC+7) of a time, e.g. "2026-10-14". */
export const wibDay = (t: number) => new Date(t + 7 * 3.6e6).toISOString().slice(0, 10);
export type Day = { key: string; r: number; hit: boolean };
/** Stable id of a trade: one signal = one placed order. */
export const tradeKey = (t: Pick<Trade, "market" | "placed_t">) => `${STRATEGY}|${t.market}|${t.placed_t}`;
export type State = { order: Trade | null; pos: Trade | null; day?: Day };

/** Zone-2 plans for both sides at the close of c.at(-1). Exactly the app's scan with frozen settings. */
export function plansAt(win: Candle[], market: string): Plan[] {
  if (win.length < MIN_CANDLES) return []; const s = SPEC.settings; const tick = TICK[market]; const out: Plan[] = [];
  for (const side of SPEC.sides) {
    const st = scan(win, side, s, { costs: { spread: 0, feePct: SPEC.costs.zoneFeePct } }); if (!st.shown) continue;
    const z = st.zones.find((x) => x.rank === SPEC.zone); if (!z) continue;
    const L = side === "long"; out.push({ side, entry: roundTick(z.entry, tick), sl: roundTick(z.stop, tick, L ? "down" : "up"), tp: roundTick(z.t1, tick), atr: st.atr, conf: st.confidence });
  }
  return out;
}
export const buffer = (px: number, market: string) => Math.max(TICK[market] ?? 0, (px * SPEC.fill.tradeThroughPct) / 100);
/** A resting limit fills only when price trades through it by the buffer (a touch is not a fill). */
export const tradesThrough = (k: Candle, side: Side, px: number, buf: number) => (side === "long" ? k.l <= px - buf : k.h >= px + buf);
/** Sell-side limit (long TP) needs price above; buy-side (short TP) below. */
const tpThrough = (k: Candle, side: Side, px: number, buf: number) => (side === "long" ? k.h >= px + buf : k.l <= px - buf);
const stopHit = (k: Candle, side: Side, sl: number) => (side === "long" ? k.l <= sl : k.h >= sl);

export type FundFn = (fromT: number, toT: number) => { rate: number; t: number }[];
/** R accounting for a closed trade. Funding: longs pay positive rates, shorts receive. */
export function settle(t: Trade, exitPx: number, reason: "tp" | "sl", exitT: number, fund?: { rows: { rate: number; t: number }[]; src: string }): Trade {
  const C = SPEC.costs; const sg = t.side === "long" ? 1 : -1; const risk = t.risk;
  const gross = (sg * (exitPx - t.entry)) / risk;
  const exitPct = reason === "tp" ? C.makerPct : C.takerPct + C.spreadPct; // stop = market order: taker + spread (slippage is in exitPx)
  const cost = (t.entry * C.makerPct / 100 + exitPx * exitPct / 100) / risk;
  const fr = (fund?.rows ?? []).filter((x) => x.t > t.fill_t! && x.t <= exitT).reduce((a, x) => a + x.rate, 0);
  const funding = (sg * fr * t.entry) / risk;
  return { ...t, status: "closed", exit_t: exitT, exit_px: exitPx, exit_reason: reason, r_gross: gross, cost_r: cost, funding_r: funding, funding_src: fund?.src ?? null, r_net: gross - cost - funding };
}
/**
 * Advance one trader by one closed candle k (index i in c, c[i] === k). Order of work inside a candle:
 * 1) open position → stop (checked first, so stop+target in one candle = stop) or target; 2) pending order → fill (trade-through), then a stop in the
 * fill candle closes it; else expire after ttlBars; 3) daily limit: realized R for the WIB day ≤ −3R → cancel the pending order, no new ones until the next WIB day
 * (open positions keep running); 4) at the close, if flat: place / replace / cancel from this candle's scan. No order while a position is open.
 */
export function step(st: State, k: Candle, plans: Plan[], market: string, fund?: { rows: { rate: number; t: number }[]; src: string }): { state: State; events: Ev[]; closed: Trade[] } {
  let { order, pos } = st; const ev: Ev[] = []; const closed: Trade[] = []; const close_t = k.t + 3.6e6;
  let day: Day = st.day?.key === wibDay(close_t) ? { ...st.day } : { key: wibDay(close_t), r: 0, hit: false }; // new WIB day: resume
  const exitStop = (p: Trade) => { const L = p.side === "long"; const gapPx = L ? Math.min(k.o, p.sl) : Math.max(k.o, p.sl); return roundTick(gapPx * (1 - (L ? 1 : -1) * SPEC.costs.stopSlipPct / 100), TICK[market]); };
  const finish = (p: Trade, px: number, why: "tp" | "sl") => { const t = settle({ ...p, bars: p.bars }, px, why, close_t, fund); day.r += t.r_net!; closed.push(t); ev.push({ kind: "close", t: close_t, data: { reason: why, px, r_net: +t.r_net!.toFixed(4) }, tr: t }); };
  if (pos) { pos = { ...pos, bars: pos.bars + 1 };
    if (stopHit(k, pos.side, pos.sl)) { finish(pos, exitStop(pos), "sl"); pos = null; }
    else if (tpThrough(k, pos.side, pos.tp, buffer(pos.tp, market))) { finish(pos, pos.tp, "tp"); pos = null; } }
  else if (order) { order = { ...order, bars: order.bars + 1 };
    if (tradesThrough(k, order.side, order.entry, buffer(order.entry, market))) {
      const p: Trade = { ...order, status: "open", fill_t: close_t, bars: 0 }; ev.push({ kind: "fill", t: close_t, data: { px: order.entry }, tr: p }); order = null;
      if (stopHit(k, p.side, p.sl)) finish(p, exitStop(p), "sl"); else pos = p; // target in the fill candle is not counted (order unknown)
    } else if (order.bars >= SPEC.ttlBars) { const x: Trade = { ...order, status: "expired", exit_t: close_t }; ev.push({ kind: "expire", t: close_t, data: { bars: order.bars }, tr: x }); closed.push(x); order = null; }
  }
  if (!day.hit && day.r <= SPEC.dailyLimitR) { day.hit = true; ev.push({ kind: "limit", t: close_t, data: { day: day.key, r: +day.r.toFixed(4), msg: "daily limit hit" }, tr: null });
    if (order) { const x: Trade = { ...order, status: "cancelled", exit_t: close_t }; ev.push({ kind: "cancel", t: close_t, data: { why: "daily limit" }, tr: x }); closed.push(x); order = null; } }
  if (!pos && !day.hit) {
    const same = order && plans.find((p) => p.side === order!.side);
    if (order && !same) { const x: Trade = { ...order, status: "cancelled", exit_t: close_t }; ev.push({ kind: "cancel", t: close_t, data: { why: "setup gone" }, tr: x }); closed.push(x); order = null; }
    if (order && same) { const tol = SPEC.replaceAtr * same.atr;
      if (Math.abs(same.entry - order.entry) > tol || Math.abs(same.sl - order.sl) > tol || Math.abs(same.tp - order.tp) > tol) {
        const from = { entry: order.entry, sl: order.sl, tp: order.tp };
        order = { ...order, entry: same.entry, sl: same.sl, tp: same.tp, risk: Math.abs(same.entry - same.sl), replaced: order.replaced + 1 };
        ev.push({ kind: "replace", t: close_t, data: { from, to: { entry: same.entry, sl: same.sl, tp: same.tp } }, tr: order }); } }
    if (!order && plans.length) { const p = [...plans].sort((a, b) => b.conf - a.conf || Math.abs(a.entry - k.c) - Math.abs(b.entry - k.c))[0];
      order = { market, side: p.side, status: "pending", placed_t: close_t, entry: p.entry, sl: p.sl, tp: p.tp, risk: Math.abs(p.entry - p.sl), conf: p.conf, replaced: 0,
        fill_t: null, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null };
      ev.push({ kind: "place", t: close_t, data: { side: p.side, entry: p.entry, sl: p.sl, tp: p.tp, conf: p.conf }, tr: order }); }
  }
  return { state: { order, pos, day }, events: ev, closed };
}
