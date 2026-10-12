import type { Candle } from "./indicators";
/**
 * ESTIMATED liquidation map: a model, NOT real positions. Bulk does not publish other traders' positions.
 * Assumptions (all configurable):
 *  - Each candle's traded notional (volume × typical price) opens new positions, split 50/50 long/short.
 *  - That notional is spread across leverage tiers with fixed weights, capped at the market's max leverage.
 *  - Liq price ≈ entry × (1 − 1/L + mmr) for longs, entry × (1 + 1/L − mmr) for shorts.
 *  - A level is removed once later price trades through it (assumed liquidated or closed).
 *  - Older opens decay (half-life), and the total is scaled to the current open interest.
 */
export const DEFAULT_TIERS: { lev: number; w: number }[] = [
  { lev: 5, w: 0.2 }, { lev: 10, w: 0.3 }, { lev: 20, w: 0.25 }, { lev: 25, w: 0.15 }, { lev: 40, w: 0.1 },
];
export type LiqBin = { price: number; long: number; short: number }; // USD notional estimated to liquidate in this bin
export function estimateLiqMap(c: Candle[], o: { maxLev: number; mmr?: number; oiUsd?: number; bins?: number; halfLifeBars?: number; tiers?: typeof DEFAULT_TIERS; rangePct?: number }): { bins: LiqBin[]; step: number } {
  const mmr = o.mmr ?? 0.02; const nb = o.bins ?? 80; const hl = o.halfLifeBars ?? 72; const rp = o.rangePct ?? 0.15;
  const tiers = (o.tiers ?? DEFAULT_TIERS).filter((t) => t.lev <= o.maxLev); const wsum = tiers.reduce((a, t) => a + t.w, 0) || 1;
  if (!c.length) return { bins: [], step: 0 };
  const px = c[c.length - 1].c; const lo = px * (1 - rp), hi = px * (1 + rp); const step = (hi - lo) / nb;
  const bins: LiqBin[] = Array.from({ length: nb }, (_, i) => ({ price: lo + (i + 0.5) * step, long: 0, short: 0 }));
  // suffix min-low / max-high: has price since candle i traded through a level?
  const minLowAfter: number[] = Array(c.length).fill(Infinity), maxHighAfter: number[] = Array(c.length).fill(-Infinity);
  for (let i = c.length - 2; i >= 0; i--) { minLowAfter[i] = Math.min(minLowAfter[i + 1], c[i + 1].l); maxHighAfter[i] = Math.max(maxHighAfter[i + 1], c[i + 1].h); }
  c.forEach((k, i) => {
    const tp = (k.h + k.l + k.c) / 3; const notional = k.v * tp; if (!(notional > 0)) return;
    const decay = Math.pow(0.5, (c.length - 1 - i) / hl);
    for (const t of tiers) {
      const n = (notional * decay * t.w) / wsum / 2;
      const ll = tp * (1 - 1 / t.lev + mmr), sl = tp * (1 + 1 / t.lev - mmr);
      if (ll > minLowAfter[i] === false && ll >= lo && ll < hi) bins[Math.floor((ll - lo) / step)].long += n;
      if (!(sl < maxHighAfter[i]) && sl >= lo && sl < hi) bins[Math.floor((sl - lo) / step)].short += n;
    }
  });
  if (o.oiUsd) { const tot = bins.reduce((a, b) => a + b.long + b.short, 0); if (tot > 0) { const f = o.oiUsd / tot; bins.forEach((b) => { b.long *= f; b.short *= f; }); } }
  return { bins, step };
}
