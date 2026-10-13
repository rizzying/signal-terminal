// Robustness checks: unseen-data split and Monte Carlo on the trade list.
export type Half = { n: number; win: number; avgR: number; ret: number; maxDD: number };
export function half(tr: { r: number; pct: number }[]): Half {
  let eq = 1, pk = 1, dd = 0; for (const t of tr) { eq *= 1 + t.pct / 100; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); }
  const n = tr.length; return { n, win: n ? (100 * tr.filter((t) => t.r > 0).length) / n : 0, avgR: n ? tr.reduce((a, t) => a + t.r, 0) / n : 0, ret: (eq - 1) * 100, maxDD: dd * 100 };
}
export const MIN_TRADES = 20;
export type Verdict = { label: "Held up" | "Fell apart" | "Too few trades"; why: string };
/** Plain rules: each half needs ≥20 trades; "held up" = unseen part still makes money per trade AND keeps at least half of the first part's average. */
export function verdict(a: Half, b: Half): Verdict {
  if (a.n < MIN_TRADES || b.n < MIN_TRADES) return { label: "Too few trades", why: `Each part needs at least ${MIN_TRADES} trades to say anything (got ${a.n} and ${b.n}). Try a longer range or a smaller timeframe.` };
  if (b.avgR > 0 && (a.avgR <= 0 || b.avgR >= 0.5 * a.avgR)) return { label: "Held up", why: `The unseen ${b.n} trades still made money on average (${b.avgR.toFixed(2)}R per trade). That's encouraging, not proof.` };
  return { label: "Fell apart", why: b.avgR <= 0 ? `On the unseen part the average trade lost money (${b.avgR.toFixed(2)}R). The first part's result was probably luck.` : `The unseen part kept less than half of the first part's average (${b.avgR.toFixed(2)}R vs ${a.avgR.toFixed(2)}R).` };
}
/** Small seeded RNG so results are repeatable. */
export function rng(seed = 1) { let x = seed >>> 0 || 1; return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 4294967296); }
const q = (xs: number[], p: number) => { const v = [...xs].sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; };
export type MC = { runs: number; n: number; ret: [number, number, number]; ddPct: [number, number, number]; ddR: [number, number, number]; shuffleDdR95: number; lossChance: number; fan: { p5: number[]; p50: number[]; p95: number[] } };
/** Bootstrap (resample with replacement) for the range of final results; shuffle (same trades, new order) for drawdown luck. Percentiles are 5th / 50th / 95th. */
export function monteCarlo(tr: { r: number; pct: number }[], runs = 1000, seed = 7): MC | null {
  const n = tr.length; if (!n) return null; const R = rng(seed); const rets: number[] = [], ddp: number[] = [], ddr: number[] = [], sddr: number[] = []; const paths: number[][] = [];
  for (let k = 0; k < runs; k++) {
    let eq = 1, pk = 1, dd = 0, cr = 0, pkr = 0, dr = 0; const path: number[] = [];
    for (let j = 0; j < n; j++) { const t = tr[Math.floor(R() * n)]; eq *= 1 + t.pct / 100; pk = Math.max(pk, eq); dd = Math.max(dd, 1 - eq / pk); cr += t.r; pkr = Math.max(pkr, cr); dr = Math.max(dr, pkr - cr); path.push((eq - 1) * 100); }
    rets.push((eq - 1) * 100); ddp.push(dd * 100); ddr.push(dr); paths.push(path);
    const idx = tr.map((_, i) => i); for (let j = n - 1; j > 0; j--) { const m = Math.floor(R() * (j + 1)); [idx[j], idx[m]] = [idx[m], idx[j]]; }
    let c2 = 0, p2 = 0, d2 = 0; for (const i of idx) { c2 += tr[i].r; p2 = Math.max(p2, c2); d2 = Math.max(d2, p2 - c2); } sddr.push(d2);
  }
  const fan = { p5: [] as number[], p50: [] as number[], p95: [] as number[] };
  for (let j = 0; j < n; j++) { const col = paths.map((p) => p[j]); fan.p5.push(q(col, 0.05)); fan.p50.push(q(col, 0.5)); fan.p95.push(q(col, 0.95)); }
  const tri = (xs: number[]) => [q(xs, 0.05), q(xs, 0.5), q(xs, 0.95)] as [number, number, number];
  return { runs, n, ret: tri(rets), ddPct: tri(ddp), ddR: tri(ddr), shuffleDdR95: q(sddr, 0.95), lossChance: (100 * rets.filter((x) => x < 0).length) / runs, fan };
}
