// Fetch lower-timeframe candles only for ambiguous bars (grouped into few requests, cached, rate-limited by the HL token bucket).
import { hlRange, TF_MS, type TF } from "../api/markets";
import type { Candle } from "./indicators";
import { pickLtf, resolve } from "./magnifier";
import type { Amb, Resolution } from "./sim";
const cache = new Map<string, Candle[]>(); // `${sym}|${ltf}|${barT}` → sub-candles
export type MagStats = { asked: number; resolved: number; noData: number };
export async function magnify(sym: string, tf: TF, ambs: Amb[], known: Record<string, Resolution>, fetcher = hlRange, now = Date.now()): Promise<{ resolved: Record<string, Resolution>; stats: MagStats }> {
  const out = { ...known }; let noData = 0; const todo = ambs.filter((a) => !(a.key in out)); const bar = TF_MS[tf];
  const byLtf = new Map<TF, number[]>();
  for (const a of todo) { const l = pickLtf(tf, a.t, now); if (!l) { noData++; continue; } if (!cache.has(`${sym}|${l}|${a.t}`)) byLtf.set(l, [...(byLtf.get(l) ?? []), a.t]); }
  for (const [l, ts] of byLtf) {
    const uniq = [...new Set(ts)].sort((a, b) => a - b); const max = 4500 * TF_MS[l];
    for (let i = 0; i < uniq.length;) { let j = i; while (j + 1 < uniq.length && uniq[j + 1] + bar - uniq[i] <= max) j++;
      try { const sub = await fetcher(sym, l, uniq[i], uniq[j] + bar - 1); for (const t of uniq.slice(i, j + 1)) cache.set(`${sym}|${l}|${t}`, sub.filter((k) => k.t >= t && k.t < t + bar)); }
      catch { /* leave unresolved → conservative */ }
      i = j + 1; }
  }
  for (const a of todo) { const l = pickLtf(tf, a.t, now); const sub = l ? cache.get(`${sym}|${l}|${a.t}`) : undefined; const r = sub ? resolve(a, sub) : null; if (r) out[a.key] = r; else if (l) noData++; }
  return { resolved: out, stats: { asked: new Set(ambs.map((a) => a.key)).size, resolved: ambs.filter((a) => out[a.key]).length, noData } };
}
