import { buildZones, heavyClusters, liqMagnetSignal, scan, type Analysis } from "../src/engine/scan";
import { DEFAULTS, sanitize } from "../src/engine/settings";
const flat = (n = 120, px = 100) => Array.from({ length: n }, (_, i) => ({ t: i * 3600e3, o: px, h: px + 0.5, l: px - 0.5, c: px, v: 10 }));
const an = (liq: Analysis["liq"], extra: Partial<Analysis> = {}): Analysis => ({ pivots: [], breaks: [], obs: [], fvgs: [], breakers: [], rsi: [50], emaF: [100], emaS: [100], atr: 1, liq, ...extra } as any);
const bins = (pairs: [number, number][]) => pairs.map(([price, short]) => ({ price, long: 0, short }));
describe("v2.6 liquidation clusters as entries", () => {
  it("finds heavy clusters on the trade side and merges touching bins", () => {
    const a = an(bins([[101, 1], [104, 10], [104.25, 8], [106, 2], [97, 50]]));
    const k = heavyClusters(a, "short", 100); expect(k).toHaveLength(1); expect(k[0].lo).toBe(104); expect(k[0].hi).toBe(104.25); expect(k[0].p).toBe(104);
    expect(heavyClusters(a, "long", 100)).toEqual([]); // the 97 bin is short liqs, wrong side for longs
  });
  it("a lone cluster becomes a 'Liq zone' entry with the stop beyond it plus the buffer", () => {
    const z = buildZones(flat(), an(bins([[104, 10]])), "short", DEFAULTS); const lz = z.find((x) => x.source.startsWith("Liq zone"))!;
    expect(lz).toBeTruthy(); expect(lz.bottom).toBeLessThanOrEqual(104); expect(lz.top).toBeGreaterThanOrEqual(104);
    expect(lz.stop).toBeGreaterThan(104 + DEFAULTS.stopAtr * 1); // beyond cluster + stopAtr×ATR (+ costs)
  });
  it("a cluster next to an order block extends that zone and tags it", () => {
    const ob = { top: 103.8, bottom: 103.2, i: 100, kind: "OB" as const, dir: "bear" as const };
    const z = buildZones(flat(), an(bins([[104, 10]]), { obs: [ob] }), "short", DEFAULTS)[0];
    expect(z.source).toBe("Bearish OB + Liq zone"); expect(z.top).toBeGreaterThanOrEqual(104); expect(z.bottom).toBeCloseTo(103.2);
  });
  it("Liq magnet passes when a heavy cluster is in/near a zone; off and no-heatmap skip it", () => {
    const c = flat(); const a = an(bins([[104, 10]]));
    expect(liqMagnetSignal(c, a, "short", DEFAULTS).pass).toBe(false); // pure liq zone only
    expect(liqMagnetSignal(c, an([]), "short", DEFAULTS)).toMatchObject({ pass: false, weight: 0 });
    expect(liqMagnetSignal(c, a, "short", sanitize({ useLiqMagnet: false }))).toMatchObject({ pass: false, weight: 0 });
    expect(sanitize({}).useLiqMagnet).toBe(true); expect(sanitize({}).weights.liqmagnet).toBe(1);
  });
  it("is part of the scan, counted in the other-signals tally", () => {
    const s = scan(flat(200), "short", DEFAULTS); const m = s.signals.find((x) => x.key === "liqmagnet")!; expect(m).toBeTruthy();
    expect(s.othersTotal).toBe(s.signals.filter((x) => x.key !== "structure" && x.weight > 0).length);
  });
});
describe("Liq magnet needs structure (rizzy's rule)", () => {
  it("a pure Liq zone alone doesn't pass", () => {
    const m = liqMagnetSignal(flat(), an(bins([[104, 10]])), "short", DEFAULTS); expect(m.pass).toBe(false); expect(m.detail).toMatch(/doesn't line up/);
  });
  it("passes when the cluster merges into an OB, naming it and the zone", () => {
    const ob = { top: 103.8, bottom: 103.2, i: 100, kind: "OB" as const, dir: "bear" as const };
    const m = liqMagnetSignal(flat(), an(bins([[104, 10]]), { obs: [ob] }), "short", DEFAULTS); expect(m.pass).toBe(true); expect(m.detail).toBe("Liq cluster ~104 lines up with Bearish OB (Zone 1)");
  });
  it("passes within 0.5 ATR of a structure zone, fails beyond", () => {
    const fvg = (top: number) => ({ top, bottom: top - 0.3, i: 100, kind: "FVG" as const, dir: "bear" as const });
    // gap from FVG top to cluster box (cluster ± 0.1 ATR): 0.4 ATR → passes; heatmap snapping needs ≤0.3 so it's not merged
    expect(liqMagnetSignal(flat(), an(bins([[104, 10]]), { fvgs: [fvg(103.55)] }), "short", DEFAULTS).detail).toMatch(/lines up with Bearish FVG/);
    expect(liqMagnetSignal(flat(), an(bins([[104, 10]]), { fvgs: [fvg(102.5)] }), "short", DEFAULTS).pass).toBe(false);
  });
});
