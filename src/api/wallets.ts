// View-only wallet watcher: public positions for Hyperliquid / Bulk addresses. No keys, no trading.
type F = typeof fetch;
export type WPos = { symbol: string; side: "long" | "short"; size: number; entry: number; mark?: number; notional: number; upnl: number; lev?: number; liq?: number | null };
export type WSnap = { equity?: number; positions: WPos[]; at: number };
const post = async (f: F, url: string, body: object) => { const r = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
export const isAddress = (ex: "hyperliquid" | "bulk", a: string) => ex === "hyperliquid" ? /^0x[0-9a-fA-F]{40}$/.test(a.trim()) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.trim());
export async function walletSnapshot(ex: "hyperliquid" | "bulk", user: string, f: F = (...a) => fetch(...a)): Promise<WSnap> {
  if (ex === "hyperliquid") {
    const r = await post(f, "https://api.hyperliquid.xyz/info", { type: "clearinghouseState", user });
    const positions = (r.assetPositions ?? []).map((x: any) => { const p = x.position; const sz = +p.szi;
      return { symbol: p.coin, side: sz >= 0 ? "long" : "short", size: Math.abs(sz), entry: +p.entryPx, notional: +p.positionValue, upnl: +p.unrealizedPnl, lev: +p.leverage?.value, liq: p.liquidationPx == null ? null : +p.liquidationPx, mark: +p.positionValue / Math.abs(sz) } as WPos; });
    return { equity: +r.marginSummary?.accountValue, positions, at: Date.now() };
  }
  const arr = await post(f, "https://mainnet-api1.bulk.trade/api/v1/account", { type: "fullAccount", user }); const a = arr?.[0]?.fullAccount;
  if (!a) throw new Error("Account not found");
  return { equity: a.margin?.totalMargin, at: Date.now(), positions: (a.positions ?? []).map((p: any) => ({ symbol: p.symbol, side: p.size >= 0 ? "long" : "short", size: Math.abs(p.size), entry: p.price, mark: p.fairPrice, notional: Math.abs(p.notional), upnl: p.unrealizedPnl, lev: p.leverage, liq: p.liquidationPrice })) };
}
