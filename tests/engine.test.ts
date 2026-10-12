import { analyze, buildZones, confidence, fvgs, pivots, scan, structureBreaks, breakers } from "../src/engine/scan";
import { DEFAULTS, sanitize } from "../src/engine/settings";
import type { Candle } from "../src/engine/indicators";

const mk = (closes: number[]): Candle[] => closes.map((c, i) => { const o = i ? (closes[i - 1] + c) / 2 : c; return { t: i * 9e5, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: 10 }; });
const wave = (n: number, drift: number) => Array.from({ length: n }, (_, i) => 100 + drift * i + 6 * Math.sin(i / 4));

describe("structure", () => {
  it("labels HH/HL in an uptrend and finds bullish BoS", () => {
    const c = mk(wave(200, 0.3)); const p = pivots(c, 3);
    expect(p.filter((x) => x.label === "HH").length).toBeGreaterThan(3);
    expect(structureBreaks(c, p, 3).at(-1)!.dir).toBe("bull");
  });
  it("swing length changes pivot count", () => { const c = mk(wave(200, 0.1)); expect(pivots(c, 1).length).toBeGreaterThan(pivots(c, 8).length); });
  it("detects unfilled bullish FVG and respects min size", () => {
    const c: Candle[] = [{ t: 0, o: 10, h: 11, l: 9, c: 10.5, v: 1 }, { t: 1, o: 10.5, h: 15, l: 10.4, c: 14.8, v: 1 }, { t: 2, o: 14.8, h: 16, l: 13, c: 15.5, v: 1 }];
    expect(fvgs(c)).toEqual([expect.objectContaining({ dir: "bull", bottom: 11, top: 13 })]);
    expect(fvgs(c, 5)).toEqual([]);
  });
  it("breaker: OB closed through flips polarity", () => {
    const c: Candle[] = [{ t: 0, o: 10, h: 10.5, l: 9, c: 9.2, v: 1 }, { t: 1, o: 9.2, h: 12, l: 9.1, c: 11.8, v: 1 }, { t: 2, o: 11.8, h: 12, l: 8, c: 8.5, v: 1 }, { t: 3, o: 8.5, h: 8.8, l: 8, c: 8.2, v: 1 }];
    const b = breakers(c, [{ top: 10.5, bottom: 9, i: 0, kind: "OB", dir: "bull" }], 1);
    expect(b[0].dir).toBe("bear");
  });
});
describe("scan", () => {
  const c = mk(wave(300, 0.2));
  it("returns 3 ranked zones each with stop, targets and R:R", () => {
    for (const dir of ["long", "short"] as const) {
      const s = scan(c, dir, DEFAULTS); expect(s.zones).toHaveLength(3);
      s.zones.forEach((z, i) => {
        expect(z.rank).toBe(i + 1); expect(z.top).toBeGreaterThanOrEqual(z.bottom);
        if (dir === "long") { expect(z.stop).toBeLessThan(z.bottom); expect(z.t1).toBeGreaterThan(z.entry); } else { expect(z.stop).toBeGreaterThan(z.top); expect(z.t1).toBeLessThan(z.entry); }
        expect(z.rr1).toBeGreaterThanOrEqual(DEFAULTS.minRR - 1e-9); expect(z.rr2).toBeGreaterThan(z.rr1); expect(z.costs.total).toBe(0);
      });
      const d = s.zones.map((z) => Math.abs(z.entry - s.price)); expect(d[0]).toBeLessThanOrEqual(d[1]); expect(d[1]).toBeLessThanOrEqual(d[2]);
    }
  });
  it("uptrend favours long; confidence is a weighted pass share; threshold gates 'shown'", () => {
    const L = scan(c, "long", DEFAULTS), S = scan(c, "short", DEFAULTS);
    expect(L.confidence).toBeGreaterThan(S.confidence);
    expect(scan(c, "long", sanitize({ threshold: 100 })).shown).toBe(L.confidence === 100);
    expect(confidence([{ key: "rsi", name: "", pass: true, weight: 3, detail: "" }, { key: "ema", name: "", pass: false, weight: 1, detail: "" }])).toBe(75);
  });
  it("weight 0 removes a signal from the score", () => {
    const w = { ...DEFAULTS.weights, ema: 0 }; const s = scan(c, "long", sanitize({ weights: w }));
    expect(s.signals.find((x) => x.key === "ema")!.weight).toBe(0);
  });
  it("settings are sanitized", () => { const s = sanitize({ rsiOS: 80, rsiOB: 70, emaFast: 50, emaSlow: 20, swingLen: 99 }); expect(s.rsiOS).toBeLessThan(s.rsiOB); expect(s.emaSlow).toBeGreaterThan(s.emaFast); expect(s.swingLen).toBe(10); });
  it("rejects too little data", () => { expect(() => scan(mk(wave(20, 0)), "long", DEFAULTS)).toThrow(); const s = scan(mk(wave(40, 0.2)), "long", DEFAULTS); expect(s.signals.find((x) => x.key === "ema")!.weight).toBe(0); });
  it("heatmap weight 0 disables liq model", () => { expect(analyze(c, sanitize({ heatmapWeight: 0 })).liq).toEqual([]); expect(buildZones(c, analyze(c, DEFAULTS), "long", DEFAULTS)).toHaveLength(3); });
});
describe("v1.1 setup rule", () => {
  const c = mk(wave(300, 0.2));
  it("structure gate + min others decides shown; HTF never affects confidence or shown", () => {
    const s = scan(c, "long", DEFAULTS);
    expect(s.shown).toBe(s.structureOk && s.othersAgree >= 3);
    const withHtf = scan(c, "long", sanitize({ useHtf: true }), { htf: mk(wave(200, -0.5)), htfTf: "1d" });
    expect(withHtf.confidence).toBe(s.confidence); expect(withHtf.shown).toBe(s.shown); expect(withHtf.htf?.agrees).toBe(false);
    expect(scan(c, "long", sanitize({ minOthers: 0, gateStructure: false })).shown).toBe(true);
    expect(DEFAULTS.useHtf).toBe(false);
  });
  it("bands", async () => { const { confidenceBand } = await import("../src/engine/scan"); expect([49, 50, 70, 71].map(confidenceBand)).toEqual(["Low", "Medium", "Medium", "High"]); });
});
describe("v1.5 costs", () => {
  const c = mk(wave(300, 0.2));
  it("min R:R default 3; costs widen the stop and are netted from R:R", () => {
    expect(DEFAULTS.minRR).toBe(3);
    const a = scan(c, "long", DEFAULTS); const b = scan(c, "long", sanitize({ slippagePct: 0.05 }), { costs: { spread: 0.2, feePct: 0.05 } });
    const za = a.zones[1], zb = b.zones[1];
    expect(zb.costs.total).toBeCloseTo(0.2 + zb.entry * 0.001 + zb.entry * 0.001);
    expect(zb.stop).toBeCloseTo(zb.rawStop - zb.costs.total); expect(zb.stop).toBeLessThan(za.stop);
    expect(zb.rr1).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(zb.rr1).toBeCloseTo((zb.t1 - zb.entry - zb.costs.total) / (zb.entry - zb.stop));
  });
  it("spread can be turned off", () => { const z = scan(c, "long", sanitize({ useSpread: false }), { costs: { spread: 5, feePct: 0 } }).zones[0]; expect(z.costs.spread).toBe(0); });
});
describe("breakout with volume", () => {
  const base = (n: number, vol = 10): Candle[] => Array.from({ length: n }, (_, i) => { const c = 100 + 3 * Math.sin(i / 3); return { t: i, o: c, h: c + 0.5, l: c - 0.5, c, v: vol }; });
  it("passes on a high-volume close above the last swing high, fails on low volume, skips with no volume", async () => {
    const { breakoutSignal } = await import("../src/engine/scan");
    const c = base(80); c.push({ t: 80, o: 102, h: 110, l: 101, c: 109, v: 40 });
    const an = { pivots: pivots(c, 3) };
    const p = breakoutSignal(c, an, "long", DEFAULTS); expect(p.pass).toBe(true); expect(p.detail).toMatch(/^Closed above .* on 4\.0× avg volume$/);
    c[80].v = 12; const f = breakoutSignal(c, an, "long", DEFAULTS); expect(f.pass).toBe(false); expect(f.detail).toMatch(/needs 1.5×/);
    expect(breakoutSignal(c, an, "short", DEFAULTS).pass).toBe(false);
    const z = base(81, 0); const sk = breakoutSignal(z, { pivots: pivots(z, 3) }, "long", DEFAULTS); expect(sk.weight).toBe(0); expect(sk.detail).toMatch(/Skipped/);
    expect(breakoutSignal(c, an, "long", sanitize({ useBreakout: false })).weight).toBe(0);
  });
  it("is one of 8 signals and counts toward the others", () => { const s = scan(mk(wave(300, 0.2)), "long", DEFAULTS); expect(s.signals).toHaveLength(8); expect(s.signals.at(-1)!.key).toBe("breakout"); });
});
