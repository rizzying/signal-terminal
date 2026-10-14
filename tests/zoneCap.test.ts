import { analyze, buildZones, MAX_ZONE_ATR } from "../src/engine/scan";
import { DEFAULTS } from "../src/engine/settings";
// v2.7.5 regression: BTC 4H short on Binance had Zone 2 at a stand-alone liq cluster ~7.9 ATR above price (above every swing).
const rnd = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
const c = (() => { let p = 100; return Array.from({ length: 300 }, (_, i) => { const o = p; p = Math.max(50, p + (rnd() - 0.5) * 2); return { t: i * 3.6e6, o, h: Math.max(o, p) + rnd(), l: Math.min(o, p) - rnd(), c: p, v: 100 + rnd() * 50 }; }); })();
const px = c.at(-1)!.c;
for (const dir of ["long", "short"] as const) it(`zones stay within ${MAX_ZONE_ATR} ATR, far liq cluster ignored, targets monotonic (${dir})`, () => {
  const an = analyze(c, DEFAULTS); const A = an.atr; const S = dir === "long" ? -1 : 1; const far = px + S * 8 * A;
  an.liq = [{ price: far, long: dir === "long" ? 1e9 : 0, short: dir === "short" ? 1e9 : 0 } as any];
  an.obs = [...an.obs, { top: far + 0.5 * A, bottom: far - 0.5 * A, i: 10, kind: "OB", dir: dir === "long" ? "bull" : "bear" } as any];
  const zs = buildZones(c, an, dir, { ...DEFAULTS, heatmapWeight: 1 });
  expect(zs).toHaveLength(3);
  for (const z of zs) {
    expect(Math.abs(z.entry - px)).toBeLessThanOrEqual(MAX_ZONE_ATR * A + 1e-9);
    expect(z.source).not.toMatch(/Liq zone \(est/);
    const D = dir === "long" ? 1 : -1; expect((z.t1 - z.entry) * D).toBeGreaterThan(0); expect((z.t2 - z.t1) * D).toBeGreaterThan(0);
  }
});
