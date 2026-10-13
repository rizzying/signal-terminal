import { lineSpecs, PriceLines } from "../src/ui/chartLines";
import { analyze, scan } from "../src/engine/scan";
import { DEFAULTS } from "../src/engine/settings";
import type { Candle } from "../src/engine/indicators";
const mk = (n: number): Candle[] => Array.from({ length: n }, (_, i) => { const c = 100 + 0.2 * i + 6 * Math.sin(i / 4); return { t: i * 9e5, o: c - 0.3, h: c + 0.8, l: c - 0.8, c, v: 50 + (i % 7) }; });
const col = { accent: "a", neg: "n", pos: "p", warn: "w" };
describe("chart price lines (regression: stale est. liq lines)", () => {
  const c = mk(300); const an = analyze(c, DEFAULTS);
  it("long → short → zone change → clear never leaves stale lines", () => {
    const live = new Set<object>(); const series = { createPriceLine: (o: any) => { const l = { ...o }; live.add(l); return l; }, removePriceLine: (l: object) => { live.delete(l); } };
    const pl = new PriceLines(series);
    const L = scan(c, "long", DEFAULTS), S = scan(c, "short", DEFAULTS);
    pl.sync(lineSpecs(L, 1, an, col)); const n1 = live.size; expect(n1).toBe(pl.count);
    pl.sync(lineSpecs(S, 1, an, col)); expect(live.size).toBe(pl.count);
    pl.sync(lineSpecs(S, 0, an, col)); pl.sync(lineSpecs(S, 2, an, col)); expect(live.size).toBe(pl.count);
    expect([...live].filter((l: any) => l.title.endsWith("liq zone")).length).toBeLessThanOrEqual(3);
    expect([...live].filter((l: any) => l.title === "TP1").length).toBe(1);
    pl.sync(lineSpecs(null, 1, an, col)); expect(live.size).toBe(0);
  });
  it("only the selected zone and the trade-side liq clusters are drawn", () => {
    const S = scan(c, "short", DEFAULTS); const sp = lineSpecs(S, 1, an, col);
    expect(sp.filter((x) => x.title === "Entry top")).toEqual([expect.objectContaining({ price: S.zones[1].top })]);
    sp.filter((x) => x.title.endsWith("liq zone")).forEach((x) => expect(x.price).toBeGreaterThan(S.price));
  });
  it("flags zones where price is already past TP1 / stop", () => {
    for (const d of ["long", "short"] as const) for (const z of scan(c, d, DEFAULTS).zones) {
      const px = c.at(-1)!.c; expect(z.pastTp1).toBe(d === "long" ? px >= z.t1 : px <= z.t1); expect(z.pastStop).toBe(d === "long" ? px <= z.stop : px >= z.stop);
    }
  });
});
it("v2: no median line on the chart, only entry top/bottom, stop, TP1, TP2 (+ liq)", () => {
  const c = mk(300); const S = scan(c, "short", DEFAULTS); const t = lineSpecs(S, 1, null, col).map((x) => x.title);
  expect(t).toEqual(["Entry top", "Entry bottom", "Stop", "TP1", "TP2"]);
});
