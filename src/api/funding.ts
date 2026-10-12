// Read-only public funding rates. No keys, no trading.
export type FundingRow = { venue: string; symbol: string; rate: number; intervalH: number; predicted?: number; nextTime?: number; via?: string };
export type FundingResult = { rows: FundingRow[]; failed: { venue: string; reason: string }[] };
export const to8h = (r: FundingRow, v = r.rate) => (v * 8) / r.intervalH;
export const toApr = (r: FundingRow, v = r.rate) => (v * 8760) / r.intervalH;

export function baseAsset(sym: string): string {
  return sym.toUpperCase().replace(/[-_/]?(PERP|SWAP)$/, "").replace(/[-_/]?(USDT|USDC|USD|BUSD|FDUSD)$/, "").replace(/^K(?=[A-Z]{3,})/, "k") || sym;
}
type F = typeof fetch;
const j = async (f: F, url: string, init?: RequestInit) => { const r = await f(url, init); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const HL = "https://api.hyperliquid.xyz/info";
const hlPost = (f: F, body: object) => j(f, HL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type Src = { venue: string; get: (b: string, f: F) => Promise<FundingRow | null> };
let hlPred: Promise<any[]> | null = null; let hlPredAt = 0;
const predicted = (f: F) => { if (!hlPred || Date.now() - hlPredAt > 30_000) { hlPredAt = Date.now(); hlPred = hlPost(f, { type: "predictedFundings" }).catch((e) => { hlPred = null; throw e; }); } return hlPred; };
const fromHlRelay = async (f: F, b: string, key: string, venue: string): Promise<FundingRow | null> => {
  const p = (await predicted(f)).find((x: any) => x[0] === b)?.[1]?.find((v: any) => v[0] === key)?.[1];
  return p ? { venue, symbol: `${b}USDT`, rate: +p.fundingRate, intervalH: p.fundingIntervalHours, nextTime: p.nextFundingTime, via: "next rate, via Hyperliquid feed" } : null;
};
export const SOURCES: Src[] = [
  { venue: "Hyperliquid", get: async (b, f) => {
    const [meta, ctx] = await hlPost(f, { type: "metaAndAssetCtxs" }); const i = meta.universe.findIndex((u: any) => u.name === b); if (i < 0) return null;
    const p = (await predicted(f).catch(() => [])).find((x: any) => x[0] === b)?.[1]?.find((v: any) => v[0] === "HlPerp")?.[1];
    return { venue: "Hyperliquid", symbol: b, rate: +ctx[i].funding, intervalH: 1, predicted: p ? +p.fundingRate : undefined, nextTime: p?.nextFundingTime };
  } },
  { venue: "Bulk", get: async (b, f) => {
    const t = await j(f, `https://mainnet-api1.bulk.trade/api/v1/ticker/${b}-USD`).catch(() => null); if (!t || t.fundingRate == null) return null;
    return { venue: "Bulk", symbol: `${b}-USD`, rate: +t.fundingRate, intervalH: 1 };
  } },
  // Binance/Bybit futures APIs geo-block many regions (HTTP 451/403, no CORS on the block page), so we read
  // their next funding rate from Hyperliquid's public predictedFundings feed instead.
  { venue: "Binance", get: (b, f) => fromHlRelay(f, b, "BinPerp", "Binance") },
  { venue: "Bybit", get: (b, f) => fromHlRelay(f, b, "BybitPerp", "Bybit") },
  { venue: "OKX", get: async (b, f) => {
    const r = await j(f, `https://www.okx.com/api/v5/public/funding-rate?instId=${b}-USDT-SWAP`); const d = r.data?.[0]; if (!d) return null;
    const ih = (+d.nextFundingTime - +d.fundingTime) / 3.6e6 || 8;
    return { venue: "OKX", symbol: d.instId, rate: +d.fundingRate, intervalH: ih, predicted: d.nextFundingRate ? +d.nextFundingRate : undefined, nextTime: +d.fundingTime };
  } },
  { venue: "Gate", get: async (b, f) => {
    const d = await j(f, `https://api.gateio.ws/api/v4/futures/usdt/contracts/${b}_USDT`);
    return { venue: "Gate", symbol: d.name, rate: +d.funding_rate, intervalH: (+d.funding_interval || 28800) / 3600, predicted: +d.funding_rate_indicative, nextTime: +d.funding_next_apply * 1000 };
  } },
  { venue: "Bitget", get: async (b, f) => {
    const r = await j(f, `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${b}USDT&productType=usdt-futures`); const d = r.data?.[0]; if (!d) return null;
    return { venue: "Bitget", symbol: d.symbol, rate: +d.fundingRate, intervalH: +d.fundingRateInterval || 8, nextTime: +d.nextUpdate };
  } },
  { venue: "dYdX", get: async (b, f) => {
    const r = await j(f, `https://indexer.dydx.trade/v4/perpetualMarkets?ticker=${b}-USD`); const d = r.markets?.[`${b}-USD`]; if (!d) return null;
    return { venue: "dYdX", symbol: d.ticker, rate: +d.nextFundingRate, intervalH: 1 };
  } },
  { venue: "Deribit", get: async (b, f) => {
    if (!["BTC", "ETH"].includes(b)) return null;
    const r = await j(f, `https://www.deribit.com/api/v2/public/ticker?instrument_name=${b}-PERPETUAL`);
    return { venue: "Deribit", symbol: `${b}-PERPETUAL`, rate: +r.result.funding_8h, intervalH: 8, predicted: undefined };
  } },
];
/** Venues probed and skipped: no CORS for browser calls, would need a backend. */
export const SKIPPED = [{ venue: "KuCoin", reason: "no CORS headers (needs a backend)" }, { venue: "MEXC", reason: "no CORS headers (needs a backend)" }];

export async function fetchFunding(sym: string, f: F = (...a) => fetch(...a)): Promise<FundingResult> {
  const b = baseAsset(sym); const rows: FundingRow[] = []; const failed: FundingResult["failed"] = [];
  await Promise.all(SOURCES.map(async (s) => {
    try { const r = await Promise.race([s.get(b, f), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]); if (r && Number.isFinite(r.rate)) rows.push(r); else failed.push({ venue: s.venue, reason: `no ${b} market` }); }
    catch (e: any) { failed.push({ venue: s.venue, reason: e?.message ? String(e.message) : "unreachable" }); }
  }));
  rows.sort((a, b) => toApr(b) - toApr(a));
  return { rows, failed };
}
/** Biggest APR spread: short the highest-funding venue (receive), long the lowest (pay least). Read-only idea. */
export function bestSpread(rows: FundingRow[]) {
  if (rows.length < 2) return null; const hi = rows.reduce((a, b) => (toApr(b) > toApr(a) ? b : a)), lo = rows.reduce((a, b) => (toApr(b) < toApr(a) ? b : a));
  return { shortOn: hi, longOn: lo, aprSpread: toApr(hi) - toApr(lo), spread8h: to8h(hi) - to8h(lo) };
}
