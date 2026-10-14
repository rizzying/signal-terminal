// Zone sanity across exchanges/symbols/TFs: distance cap, monotonic targets, liq zones near structure. npx vite-node scripts_zonecheck.ts
import { candles, marketsCached, type Exchange, type TF } from "./src/api/markets";
import { scan, fmt, analyze } from "./src/engine/scan";
import { DEFAULTS } from "./src/engine/settings";
import { mmrFor } from "./src/engine/liq";
const only = process.env.ONLY; let bad = 0;
const SYMS: Record<Exchange, string[]> = { hyperliquid: ["BTC", "ETH", "SOL", "HYPE"], binance: ["BTCUSDT", "ETHUSDT", "SOLUSDT"], bulk: ["BTC-USD", "ETH-USD", "SOL-USD"] };
for (const ex of Object.keys(SYMS) as Exchange[]) { const ms = await marketsCached(ex).catch(() => []); console.log(ex, ms.length, "markets");
  for (const sym of SYMS[ex]) for (const tf of ["15m", "1h", "4h", "1d"] as TF[]) {
    if (only && `${ex}:${sym}:${tf}` !== only) continue;
    let c; try { c = await candles(ex, sym, tf, 400); } catch (e) { console.log(ex, sym, tf, "ERR", String(e).slice(0, 60)); continue; }
    if (c.length < 100) continue; const mk = ms.find((m) => m.symbol === sym);
    for (const dir of ["long", "short"] as const) { const st = scan(c, dir, DEFAULTS, { maxLev: mk?.maxLev, mmr: mmrFor(ex, mk?.maxLev) }); const A = analyze(c, DEFAULTS, mk?.maxLev, mmrFor(ex, mk?.maxLev)).atr; const px = c.at(-1)!.c; const S = dir === "short" ? -1 : 1;
      const issues: string[] = [];
      for (const z of st.zones) { const far = Math.abs(z.entry - px) / A; if (far > 3.51) issues.push(`Z${z.rank} ${far.toFixed(1)}ATR away`);
        if (!((z.t1 - z.entry) * S > 0 && (z.t2 - z.t1) * S > 0)) issues.push(`Z${z.rank} targets not monotonic`); }
      if (issues.length || only) { bad += issues.length ? 1 : 0; console.log(ex, sym, tf, dir, "px", fmt(px), issues.join("; ") || "ok", only ? "\n" + st.zones.map((z) => `  Z${z.rank} ${fmt(z.bottom)}-${fmt(z.top)} SL ${fmt(z.stop)} TP1 ${fmt(z.t1)} TP2 ${fmt(z.t2)} ${z.rr1.toFixed(2)}R ${z.source}`).join("\n") : ""); }
    } }
}
console.log(bad ? `${bad} setups with issues` : "all ok"); process.exit(bad ? 1 : 0);
