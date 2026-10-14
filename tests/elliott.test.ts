import { describe, it, expect } from "vitest";
import { ewPivots, fitElliott, impulseOk, elliottOverlay, type EwPivot } from "../src/engine/elliott";
import type { Candle } from "../src/engine/indicators";
// build candles walking linearly through waypoint prices, `n` bars per leg, small ranges (ATR ~1)
const path = (pts: number[], n = 12): Candle[] => { const out: Candle[] = []; const push = (c: number) => out.push({ t: out.length * 36e5, o: c, h: c + 0.5, l: c - 0.5, c, v: 1 });
  for (let i = 0; i < 20; i++) push(pts[0]); for (let k = 1; k < pts.length; k++) for (let j = 1; j <= n; j++) push(pts[k - 1] + ((pts[k] - pts[k - 1]) * j) / n); for (let i = 0; i < 6; i++) push(pts.at(-1)!); return out; };
const piv = (ps: number[], first: "low" | "high"): EwPivot[] => ps.map((price, n) => ({ i: n * 10, price, kind: (n % 2 === 0) === (first === "low") ? "low" : "high", confirmedAt: n * 10 + 3 }));
describe("Elliott wave fitter (experimental overlay)", () => {
  it("accepts a textbook up impulse", () => expect(impulseOk([100, 120, 110, 150, 130, 145], "up")).toBe(true));
  it("rule 1: wave 2 retracing 100%+ of wave 1 is rejected", () => expect(impulseOk([100, 120, 99, 150, 130, 145], "up")).toBe(false));
  it("rule 2: wave 3 shortest is rejected", () => expect(impulseOk([100, 130, 115, 135, 125, 160], "up")).toBe(false));
  it("rule 3: wave 4 overlapping wave 1 is rejected", () => expect(impulseOk([100, 120, 110, 150, 119, 145], "up")).toBe(false));
  it("mirrors for down impulses", () => { expect(impulseOk([200, 180, 190, 150, 170, 155], "down")).toBe(true); expect(impulseOk([200, 180, 190, 150, 181, 155], "down")).toBe(false); });
  it("labels 1-5 then A-B-C", () => {
    const f = fitElliott(piv([100, 120, 110, 150, 130, 145, 132, 140, 125], "low"))!;
    expect(f.dir).toBe("up"); expect(f.labels.map((l) => l.text)).toEqual(["1", "2", "3", "4", "5", "A", "B", "C"]);
  });
  it("returns null when no valid count exists", () => expect(fitElliott(piv([100, 120, 99, 150, 90, 145], "low"))).toBeNull());
  it("zigzag finds pivots on synthetic candles and fits the impulse", () => {
    const c = path([100, 120, 110, 150, 130, 145, 132]);
    const p = ewPivots(c); expect(p.map((x) => x.kind)).toEqual(["low", "high", "low", "high", "low", "high", "low"].slice(p[0].kind === "low" ? 0 : 1, p.length + (p[0].kind === "low" ? 0 : 1)));
    for (const x of p) expect(x.confirmedAt - x.i).toBeGreaterThanOrEqual(2);
    const f = elliottOverlay(c); expect(f?.labels.slice(0, 5).map((l) => l.text)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("non-repainting: confirmed pivots never change as more candles arrive", () => {
    const c = path([100, 120, 110, 150, 130, 145, 132, 141, 120], 9); const full = ewPivots(c);
    for (let n = 30; n <= c.length; n++) { const part = ewPivots(c.slice(0, n)); expect(part).toEqual(full.filter((p) => p.confirmedAt < n)); }
  });
  it("ignores the possibly-forming last candle", () => {
    const c = path([100, 120, 110, 150, 130, 145, 132]); const spike = [...c, { ...c.at(-1)!, t: c.length * 36e5, h: 999, l: 1 }];
    expect(elliottOverlay(spike)).toEqual(elliottOverlay([...c, c.at(-1)!]));
  });
});
