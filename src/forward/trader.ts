// v3.2 forward test: one virtual trader per scorecard × market. Pure functions shared by the hourly job and the tests.
// v1 (bn-1h-z2-v1, hash b81ceeeb) is frozen in LEGACY_SPEC and is never stepped again. New trades are v2 books.
import type { Candle } from "../engine/indicators";
import { scan, MIN_CANDLES } from "../engine/scan";
import { DEFAULTS, sanitize, type Settings } from "../engine/settings";
import { roundTick } from "../api/markets";
import { liveBooks, TF_MS, strategyId } from "./books.js";

export type Side = "long" | "short";
export type Tf = "15m" | "1h" | "4h";
type BookMeta = { tf: Tf; zone: number; id: string; name: string; headline: boolean; legacy: boolean };

const SETTINGS = sanitize({ ...DEFAULTS, minRR: 3 }) as Settings;
const MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const FILL = { tradeThroughPct: 0.02, tradeThroughTicks: 1 };
const COSTS = { makerPct: 0.02, takerPct: 0.05, spreadPct: 0.02, stopSlipPct: 0.05, zoneFeePct: 0.05 };

/**
 * Frozen v3.0 strategy. Do not edit: rulesHash(LEGACY_SPEC) must stay b81ceeeb.
 * The live job does not step this book. It exists so old rows stay labelled and the hash can be checked.
 */
export const LEGACY_SPEC = {
  id: "bn-1h-z2", name: "Binance 1H Zone 2", version: "1",
  data: "Binance spot klines (data-api.binance.vision), closed 1H candles", markets: ["BTCUSDT", "ETHUSDT", "SOLUSDT"], tf: "1h", window: 400,
  zone: 2, sides: ["long", "short"], exit: "all at TP1 (exitMode 0)", ttlBars: 24, replaceAtr: 0.1,
  fill: { tradeThroughPct: 0.02, tradeThroughTicks: 1 },
  costs: { makerPct: 0.02, takerPct: 0.05, spreadPct: 0.02, stopSlipPct: 0.05, zoneFeePct: 0.05 },
  sameCandle: "stop", funding: "Binance USDT-M perp funding; else Hyperliquid funding for the same coin (labelled proxy)",
  finish: { firstRead: 30, decision: 100 }, dailyLimitR: -3, // per trader, WIB calendar day, realized R
  settings: SETTINGS,
} as const;
export const LEGACY_STRATEGY = "bn-1h-z2-v1";
export const LEGACY_HASH = "b81ceeeb";

/** Shared v2 rules. Zone and timeframe are the only fields that differ between scorecards. Orders are locked. */
const v2Spec = (meta: BookMeta) => ({
  id: `bn-${meta.tf}-z${meta.zone}`, name: meta.name, version: "2" as const,
  data: "Binance spot klines (data-api.binance.vision), closed candles of this scorecard's timeframe",
  markets: [...MARKETS], tf: meta.tf, window: 400,
  zone: meta.zone, sides: ["long", "short"] as const, exit: "all at TP1 (exitMode 0)", ttlBars: 24,
  lockOrders: true, // price is fixed at placement; no replace, no setup-gone cancel
  fill: FILL,
  costs: COSTS,
  sameCandle: "stop", funding: "Binance USDT-M perp funding; else Hyperliquid funding for the same coin (labelled proxy)",
  finish: { firstRead: 30, decision: 100 }, dailyLimitR: -3, // per scorecard per market, WIB calendar day, realized R
  settings: SETTINGS,
});

/** FNV-1a over key-sorted JSON. */
export function rulesHash(o: unknown = undefined): string {
  const spec = o === undefined ? HEADLINE_SPEC : o;
  const norm = (v: any): any => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : Array.isArray(v) ? v.map(norm) : v);
  let h = 0x811c9dc5; for (const ch of JSON.stringify(norm(spec))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0");
}

export type Book = {
  id: string; strategy: string; name: string; tf: Tf; zone: 1 | 2 | 3; barMs: number;
  headline: boolean; legacy: boolean; hash: string; spec: ReturnType<typeof v2Spec>;
};
function toBook(meta: BookMeta): Book {
  const spec = v2Spec(meta);
  return { id: spec.id, strategy: strategyId(meta.tf, meta.zone), name: meta.name, tf: meta.tf, zone: meta.zone as 1 | 2 | 3, barMs: TF_MS[meta.tf], headline: meta.headline, legacy: false, hash: "", spec };
}
/** Nine live books. Headline (1H Zone 2) is index 0. */
export const BOOKS: Book[] = (liveBooks() as BookMeta[]).map((meta) => { const b = toBook(meta); b.hash = rulesHash(b.spec); return b; });
const HEADLINE_SPEC = BOOKS[0].spec;
/** Headline book: Binance spot 1H Zone 2, v2. Reported first everywhere. */
export const SPEC = HEADLINE_SPEC;
export const STRATEGY = BOOKS[0].strategy;
export const BOOK_HASH: Record<string, string> = Object.fromEntries(BOOKS.map((b) => [b.strategy, b.hash]));

export const TICK: Record<string, number> = { BTCUSDT: 0.01, ETHUSDT: 0.01, SOLUSDT: 0.01 };
export type Plan = { side: Side; entry: number; sl: number; tp: number; atr: number; conf: number };
export type Trade = { id?: number; market: string; side: Side; status: "pending" | "open" | "closed" | "cancelled" | "expired";
  placed_t: number; entry: number; sl: number; tp: number; risk: number; conf: number; replaced: number;
  fill_t: number | null; exit_t: number | null; exit_px: number | null; exit_reason: "tp" | "sl" | null; bars: number; r_gross: number | null; cost_r: number | null; funding_r: number | null; funding_src: string | null; r_net: number | null };
export type Ev = { kind: "place" | "replace" | "cancel" | "expire" | "fill" | "close" | "limit"; t: number; data: Record<string, unknown>; tr: Trade | null };
/** WIB calendar day (UTC+7) of a time, e.g. "2026-10-14". */
export const wibDay = (t: number) => new Date(t + 7 * 3.6e6).toISOString().slice(0, 10);
export type Day = { key: string; r: number; hit: boolean };
/** Stable id of a trade: one signal = one placed order, per scorecard. */
export const tradeKey = (t: Pick<Trade, "market" | "placed_t">, strategy = STRATEGY) => `${strategy}|${t.market}|${t.placed_t}`;
export type State = { order: Trade | null; pos: Trade | null; day?: Day };

/** Plans for each zone from one scan per side. Same settings on every scorecard; only the rank differs. */
export function plansByZone(win: Candle[], market: string, zones: readonly number[] = [1, 2, 3]): Record<number, Plan[]> {
  const out: Record<number, Plan[]> = {}; for (const z of zones) out[z] = [];
  if (win.length < MIN_CANDLES) return out;
  const s = SPEC.settings; const tick = TICK[market];
  for (const side of SPEC.sides) {
    const st = scan(win, side, s, { costs: { spread: 0, feePct: SPEC.costs.zoneFeePct } }); if (!st.shown) continue;
    for (const z of zones) {
      const zone = st.zones.find((x) => x.rank === z); if (!zone) continue;
      const L = side === "long";
      out[z].push({ side, entry: roundTick(zone.entry, tick), sl: roundTick(zone.stop, tick, L ? "down" : "up"), tp: roundTick(zone.t1, tick), atr: st.atr, conf: st.confidence });
    }
  }
  return out;
}
/** Zone plans at the close of win.at(-1). Defaults to the headline zone. */
export function plansAt(win: Candle[], market: string, zone = SPEC.zone): Plan[] {
  return plansByZone(win, market, [zone])[zone] ?? [];
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
 * Advance one scorecard's trader by one closed candle k. barMs is that timeframe's length (close = open + barMs).
 * Order of work: 1) open position, stop then target (same candle = stop); 2) pending order, fill then expire after 24 bars;
 * 3) daily limit (−3R realized this WIB day cancels the pending order and blocks new ones; open positions keep running);
 * 4) if flat, place one order. A resting order never moves and is never cancelled because the setup moved or disappeared.
 * A new order is placed only when the previous one has fully closed (filled and exited, or expired) or was cancelled by the daily limit on a later day.
 */
export function step(st: State, k: Candle, plans: Plan[], market: string, fund?: { rows: { rate: number; t: number }[]; src: string }, barMs = 3.6e6): { state: State; events: Ev[]; closed: Trade[] } {
  let { order, pos } = st; const ev: Ev[] = []; const closed: Trade[] = []; const close_t = k.t + barMs;
  let day: Day = st.day?.key === wibDay(close_t) ? { ...st.day } : { key: wibDay(close_t), r: 0, hit: false };
  const exitStop = (p: Trade) => { const L = p.side === "long"; const gapPx = L ? Math.min(k.o, p.sl) : Math.max(k.o, p.sl); return roundTick(gapPx * (1 - (L ? 1 : -1) * SPEC.costs.stopSlipPct / 100), TICK[market]); };
  const finish = (p: Trade, px: number, why: "tp" | "sl") => { const t = settle({ ...p, bars: p.bars }, px, why, close_t, fund); day.r += t.r_net!; closed.push(t); ev.push({ kind: "close", t: close_t, data: { reason: why, px, r_net: +t.r_net!.toFixed(4) }, tr: t }); };
  if (pos) { pos = { ...pos, bars: pos.bars + 1 };
    if (stopHit(k, pos.side, pos.sl)) { finish(pos, exitStop(pos), "sl"); pos = null; }
    else if (tpThrough(k, pos.side, pos.tp, buffer(pos.tp, market))) { finish(pos, pos.tp, "tp"); pos = null; } }
  else if (order) { order = { ...order, bars: order.bars + 1 };
    if (tradesThrough(k, order.side, order.entry, buffer(order.entry, market))) {
      const p: Trade = { ...order, status: "open", fill_t: close_t, bars: 0 }; ev.push({ kind: "fill", t: close_t, data: { px: order.entry }, tr: p }); order = null;
      if (stopHit(k, p.side, p.sl)) finish(p, exitStop(p), "sl"); else pos = p;
    } else if (order.bars >= SPEC.ttlBars) { const x: Trade = { ...order, status: "expired", exit_t: close_t }; ev.push({ kind: "expire", t: close_t, data: { bars: order.bars }, tr: x }); closed.push(x); order = null; }
  }
  if (!day.hit && day.r <= SPEC.dailyLimitR) { day.hit = true; ev.push({ kind: "limit", t: close_t, data: { day: day.key, r: +day.r.toFixed(4), msg: "daily limit hit" }, tr: null });
    if (order) { const x: Trade = { ...order, status: "cancelled", exit_t: close_t }; ev.push({ kind: "cancel", t: close_t, data: { why: "daily limit" }, tr: x }); closed.push(x); order = null; } }
  // Locked: the resting order's entry, stop and target are not touched. No second order while one is pending or a position is open.
  if (!pos && !order && !day.hit && plans.length) {
    const p = [...plans].sort((a, b) => b.conf - a.conf || Math.abs(a.entry - k.c) - Math.abs(b.entry - k.c))[0];
    order = { market, side: p.side, status: "pending", placed_t: close_t, entry: p.entry, sl: p.sl, tp: p.tp, risk: Math.abs(p.entry - p.sl), conf: p.conf, replaced: 0,
      fill_t: null, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null };
    ev.push({ kind: "place", t: close_t, data: { side: p.side, entry: p.entry, sl: p.sl, tp: p.tp, conf: p.conf }, tr: order });
  }
  return { state: { order, pos, day }, events: ev, closed };
}
