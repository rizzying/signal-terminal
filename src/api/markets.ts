import { TokenBucket } from "./limiter";
import type { Candle } from "../engine/indicators";

export type Exchange = "hyperliquid" | "bulk" | "binance";
export type TF = "1m" | "5m" | "15m" | "1h" | "4h" | "12h" | "1d" | "3d" | "1w";
export const TFS: TF[] = ["1m", "5m", "15m", "1h", "4h", "12h", "1d", "3d", "1w"];
export const TF_MS: Record<TF, number> = { "1m": 6e4, "5m": 3e5, "15m": 9e5, "1h": 3.6e6, "4h": 1.44e7, "12h": 4.32e7, "1d": 8.64e7, "3d": 2.592e8, "1w": 6.048e8 };
/** Intervals each exchange's public candle API serves (all verified live Oct 2026). Unsupported ones are hidden in the UI. */
export const EX_TFS: Record<"hyperliquid" | "bulk" | "binance", TF[]> = { hyperliquid: TFS, bulk: TFS, binance: TFS };
export const tfsFor = (ex: "hyperliquid" | "bulk" | "binance") => EX_TFS[ex];
export type Market = { symbol: string; label: string; maxLev: number };

type F = typeof fetch;
const buckets: Record<Exchange, TokenBucket> = { hyperliquid: new TokenBucket(4, 10), bulk: new TokenBucket(4, 20), binance: new TokenBucket(8, 20) };
const BULK = "https://mainnet-api1.bulk.trade/api/v1";
const HL = "https://api.hyperliquid.xyz/info";
// Binance public market-data mirror (spot, CORS-enabled, no key, works where api.binance.com is geo-blocked)
const BN = "https://data-api.binance.vision/api/v3";

export class MarketError extends Error {}

const inflight = new Map<string, Promise<any>>();
const TIMEOUT_MS = 15_000;
/** Rate-limited JSON fetch with retries, a 15s timeout, clear errors and de-duplication of identical in-flight requests. */
export function getJson(ex: Exchange, url: string, init?: RequestInit, f: F = (...a) => fetch(...a)): Promise<any> {
  const k = `${ex} ${url} ${typeof init?.body === "string" ? init.body : ""}`; const hit = inflight.get(k); if (hit) return hit;
  const p = fetchJson(ex, url, init, f).finally(() => inflight.delete(k)); inflight.set(k, p); return p;
}
async function fetchJson(ex: Exchange, url: string, init: RequestInit | undefined, f: F, attempt = 0): Promise<any> {
  await buckets[ex].take();
  let r: Response; const ac = typeof AbortController !== "undefined" ? new AbortController() : null; const to = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : null;
  try { r = await f(url, ac ? { ...init, signal: ac.signal } : init); } catch {
    if (attempt < 2) { await new Promise((s) => setTimeout(s, 800 * 2 ** attempt)); return fetchJson(ex, url, init, f, attempt + 1); }
    throw new MarketError(`Can't reach ${ex} (offline, slow or blocked).`);
  } finally { if (to) clearTimeout(to); }
  if (r.status >= 500 && ex === "hyperliquid") { const t = await r.text().catch(() => ""); if (t.trim() === "null") throw new MarketError("Not listed on Hyperliquid (or no data for this request)."); r = new Response(t, { status: r.status }); }
  if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt)); return fetchJson(ex, url, init, f, attempt + 1); }
  if (!r.ok) { let msg = ""; try { const j = await r.json(); msg = j?.msg || j?.message || j?.error || ""; } catch { /* no body */ }
    throw new MarketError(r.status === 429 ? `${ex} is rate-limiting requests; try again in a minute.` : r.status === 400 || r.status === 404 ? `Not available on ${ex}${msg ? ` (${msg})` : ""}.` : `${ex} returned ${r.status}${msg ? `: ${msg}` : ""}.`); }
  return r.json();
}
const hl = (body: object, f?: F) => getJson("hyperliquid", HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, f);

export async function listMarkets(ex: Exchange, f?: F): Promise<Market[]> {
  if (ex === "hyperliquid") {
    const m = await hl({ type: "meta" }, f);
    return m.universe.filter((u: any) => !u.isDelisted).map((u: any) => ({ symbol: u.name, label: `${u.name}-PERP`, maxLev: u.maxLeverage }));
  }
  if (ex === "bulk") {
    const m = await getJson("bulk", `${BULK}/exchangeInfo`, undefined, f);
    return m.filter((s: any) => s.status !== "SUSPENDED" && s.status !== "DELISTED").map((s: any) => ({ symbol: s.symbol, label: s.symbol, maxLev: s.maxLeverage ?? 20 }));
  }
  const m = await getJson("binance", `${BN}/exchangeInfo?permissions=SPOT`, undefined, f);
  return m.symbols.filter((s: any) => s.status === "TRADING").map((s: any) => ({ symbol: s.symbol, label: `${s.baseAsset}/${s.quoteAsset}`, maxLev: 20 }));
}

export async function candles(ex: Exchange, symbol: string, tf: TF, n = 300, f?: F): Promise<Candle[]> {
  const start = Date.now() - TF_MS[tf] * n;
  if (ex === "hyperliquid") {
    const r = await hl({ type: "candleSnapshot", req: { coin: symbol, interval: tf, startTime: start } }, f);
    return r.map((k: any) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
  }
  if (ex === "bulk") {
    const r = await getJson("bulk", `${BULK}/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&startTime=${start}`, undefined, f);
    return r.map((k: any) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v })).slice(-n);
  }
  const iv = tf === "1w" ? "1w" : tf;
  const r = await getJson("binance", `${BN}/klines?symbol=${symbol}&interval=${iv}&limit=${Math.min(n, 1000)}`, undefined, f);
  return r.map((k: any[]) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

/** Public fills for a wallet address (no keys). Returns normalized fills. */
export type Fill = { time: number; symbol: string; side: "buy" | "sell"; px: number; sz: number; pnl?: number };
export async function walletFills(ex: "hyperliquid" | "bulk", user: string, f?: F): Promise<Fill[]> {
  if (ex === "hyperliquid") {
    const r = await hl({ type: "userFills", user }, f);
    return r.map((x: any) => ({ time: x.time, symbol: x.coin, side: x.side === "B" ? "buy" : "sell", px: +x.px, sz: +x.sz, pnl: +x.closedPnl || 0 }));
  }
  const r = await getJson("bulk", `${BULK}/account`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "fills", user, limit: 1000 }) }, f);
  return (r.data ?? []).map((x: any) => ({ time: x.timestamp > 1e14 ? Math.floor(x.timestamp / 1e6) : x.timestamp, symbol: x.symbol, side: (x.maker === user ? !x.isBuy : x.isBuy) ? "buy" : "sell", px: x.price, sz: Math.abs(x.amount) }));
}

/** Best bid/ask from the public order book (read-only). */
export type Book = { bid: number; ask: number; spread: number; spreadPct: number };
export async function topOfBook(ex: Exchange, symbol: string, f?: F): Promise<Book> {
  let bid: number, ask: number;
  if (ex === "hyperliquid") { const r = await hl({ type: "l2Book", coin: symbol }, f); bid = +r.levels[0][0].px; ask = +r.levels[1][0].px; }
  else if (ex === "bulk") { const r = await getJson("bulk", `${BULK}/l2book?type=l2book&coin=${encodeURIComponent(symbol)}&nlevels=1`, undefined, f); bid = +r.levels[0][0].px; ask = +r.levels[1][0].px; }
  else { const r = await getJson("binance", `${BN}/ticker/bookTicker?symbol=${symbol}`, undefined, f); bid = +r.bidPrice; ask = +r.askPrice; }
  if (!(bid > 0 && ask >= bid)) throw new MarketError("Order book is empty.");
  const spread = ask - bid; return { bid, ask, spread, spreadPct: spread / ((ask + bid) / 2) };
}
export const feeFor = (ex: Exchange, s: { feeHyperliquid: number; feeBulk: number; feeBinance: number }) => (ex === "hyperliquid" ? s.feeHyperliquid : ex === "bulk" ? s.feeBulk : s.feeBinance);

/** Hyperliquid candles between two times (HL only serves the most recent ~5000 candles per interval). */
export async function hlRange(symbol: string, tf: TF, start: number, end: number, f?: F): Promise<Candle[]> {
  const r = await hl({ type: "candleSnapshot", req: { coin: symbol, interval: tf, startTime: start, endTime: end } }, f);
  return r.map((k: any) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }));
}

