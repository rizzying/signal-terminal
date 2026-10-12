export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export function ema(x: number[], n: number): number[] {
  const k = 2 / (n + 1); const out: number[] = []; let prev = NaN;
  x.forEach((v, i) => {
    if (i < n - 1) { out.push(NaN); return; }
    if (i === n - 1) { prev = x.slice(0, n).reduce((a, b) => a + b, 0) / n; out.push(prev); return; }
    prev = v * k + prev * (1 - k); out.push(prev);
  });
  return out;
}
/** Wilder RSI */
export function rsi(x: number[], n = 14): number[] {
  const out: number[] = Array(x.length).fill(NaN); if (x.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = x[i] - x[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < x.length; i++) {
    const d = x[i] - x[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
export function atr(c: Candle[], n = 14): number[] {
  const tr = c.map((k, i) => i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - c[i - 1].c), Math.abs(k.l - c[i - 1].c)));
  const out: number[] = Array(c.length).fill(NaN); if (c.length < n) return out;
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n; out[n - 1] = a;
  for (let i = n; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}
