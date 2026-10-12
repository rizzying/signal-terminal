// Read-only public positioning data: open interest history, long/short ratio, recent liquidations.
import type { TF } from "./markets";
type F = typeof fetch;
const j = async (f: F, url: string) => { const r = await f(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const GATE = "https://api.gateio.ws/api/v4/futures/usdt";
const GATE_IV: Record<TF, string> = { "15m": "15m", "4h": "4h", "1d": "1d", "1w": "1d" };

export type OIPoint = { t: number; oiUsd: number; lsAccount: number; longLiqUsd: number; shortLiqUsd: number };
/** Gate.io USDT-perp contract stats (CORS-enabled). Used as a market-wide proxy for OI and long/short. */
export async function oiHistory(base: string, tf: TF, limit = 300, f: F = (...a) => fetch(...a)): Promise<OIPoint[]> {
  const r = await j(f, `${GATE}/contract_stats?contract=${base}_USDT&interval=${GATE_IV[tf]}&limit=${limit}`);
  if (!Array.isArray(r)) throw new Error("no data");
  return r.map((x: any) => ({ t: x.time * 1000, oiUsd: +x.open_interest_usd, lsAccount: +x.lsr_account, longLiqUsd: +x.long_liq_usd, shortLiqUsd: +x.short_liq_usd }));
}
export function oiChange(pts: OIPoint[], bars: number) { if (pts.length <= bars) return null; const a = pts[pts.length - 1 - bars].oiUsd, b = pts.at(-1)!.oiUsd; return a ? (b - a) / a : null; }

export type Liq = { venue: string; t: number; side: "long" | "short"; px: number; usd: number };
const ctCache: Record<string, number> = {};
export async function recentLiqs(base: string, f: F = (...a) => fetch(...a)): Promise<{ liqs: Liq[]; failed: string[] }> {
  const out: Liq[] = []; const failed: string[] = [];
  await Promise.all([
    (async () => {
      const key = `gate:${base}`; ctCache[key] ??= +(await j(f, `${GATE}/contracts/${base}_USDT`)).quanto_multiplier;
      const r = await j(f, `${GATE}/liq_orders?contract=${base}_USDT&limit=50`);
      // order_size < 0 = a long was force-sold; > 0 = a short was force-bought
      for (const x of r) out.push({ venue: "Gate", t: x.time * 1000, side: +x.order_size < 0 ? "long" : "short", px: +x.fill_price, usd: Math.abs(+x.size) * ctCache[key] * +x.fill_price });
    })().catch(() => failed.push("Gate")),
    (async () => {
      const key = `okx:${base}`; ctCache[key] ??= +(await j(f, `https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${base}-USDT-SWAP`)).data[0].ctVal;
      const r = await j(f, `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=${base}-USDT&state=filled&limit=100`);
      for (const d of r.data?.[0]?.details ?? []) out.push({ venue: "OKX", t: +d.ts, side: d.posSide === "short" ? "short" : "long", px: +d.bkPx, usd: +d.sz * ctCache[key] * +d.bkPx });
    })().catch(() => failed.push("OKX")),
  ]);
  return { liqs: out.filter((l) => Number.isFinite(l.usd)).sort((a, b) => b.t - a.t).slice(0, 60), failed };
}
export type LS = { venue: string; ratio: number; longPct: number; prev?: number };
export async function longShort(base: string, f: F = (...a) => fetch(...a)): Promise<LS[]> {
  const out: LS[] = [];
  await Promise.all([
    oiHistory(base, "4h", 7, f).then((p) => { const l = p.at(-1)!; out.push({ venue: "Gate", ratio: l.lsAccount, longPct: l.lsAccount / (1 + l.lsAccount), prev: p[0]?.lsAccount }); }).catch(() => {}),
    j(f, `https://api.bitget.com/api/v2/mix/market/account-long-short?symbol=${base}USDT&period=1h`).then((r) => { const d = r.data; const l = d.at(-1); out.push({ venue: "Bitget", ratio: +l.longShortAccountRatio, longPct: +l.longAccountRatio, prev: +d[Math.max(0, d.length - 25)].longShortAccountRatio }); }).catch(() => {}),
  ]);
  return out;
}
