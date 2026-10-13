import { simulate, type BarSig } from "../src/engine/sim";
import { resolve, pickLtf } from "../src/engine/magnifier";
import { magnify } from "../src/engine/magnifyFetch";
import { half, verdict, monteCarlo } from "../src/engine/robust";
import type { Candle } from "../src/engine/indicators";
const bar = (t: number, o: number, h: number, l: number, c: number): Candle => ({ t, o, h, l, c, v: 1 });
const sig = (n: number): BarSig[] => { const s: BarSig[] = new Array(n).fill(null); s[0] = { atr: 1, long: { conf: 80, z: [[99, 100], [99, 100], [99, 100]] } }; return s; };
const H = 3.6e6;
// entry at 99.5 (close in zone), stop 98, TP 2R = 102.5; bar 2 hits both
const c = [bar(0, 101, 101, 101, 101), bar(H, 101, 101, 99.4, 99.5), bar(2 * H, 99.5, 103, 97.5, 101)];
const o = { zone: 1 as const, k: 1, tpR: 2, exit: 0 as const, onClose: true, costFrac: 0 };
describe("bar magnifier", () => {
  it("flags the ambiguous candle and defaults to stop first", () => { const amb: any[] = []; const t = simulate(c, sig(3), { ...o, amb }); expect(amb).toHaveLength(1); expect(amb[0].kind).toBe("exit"); expect(t[0].outcome).toBe("stop"); });
  it("uses the answer from smaller candles", () => {
    const amb: any[] = []; simulate(c, sig(3), { ...o, amb });
    const upFirst = [bar(2 * H, 99.5, 103, 99.4, 102.8), bar(2 * H + 9e5, 102.8, 102.9, 97.5, 98)];
    expect(resolve(amb[0], upFirst)).toBe("tp");
    expect(resolve(amb[0], [...upFirst].reverse())).toBe("stop");
    expect(resolve(amb[0], [bar(0, 100, 103, 97, 100)])).toBe("stop"); // still both inside one small candle → conservative
    const t = simulate(c, sig(3), { ...o, resolved: { [amb[0].key]: "tp" } }); expect(t[0].outcome).toBe("tp1"); expect(t[0].r).toBeCloseTo(2);
  });
  it("entry ambiguity in touch mode", () => {
    const amb: any[] = []; const cc = [bar(0, 101, 101, 101, 101), bar(H, 101, 101, 97.5, 99)]; simulate(cc, sig(2), { ...o, onClose: false, amb });
    expect(amb[0].kind).toBe("entry"); expect(resolve(amb[0], [bar(H, 101, 101, 99.5, 100), bar(H + 1, 100, 100.2, 99.8, 100)])).toBe("none");
  });
  it("picks the finest interval Hyperliquid still has, else none", () => {
    const now = Date.UTC(2026, 9, 13); expect(pickLtf("4h", now - 86400e3, now)).toBe("5m"); expect(pickLtf("4h", now - 40 * 86400e3, now)).toBe("15m"); expect(pickLtf("4h", now - 3000 * 86400e3, now)).toBe(null); expect(pickLtf("1m", now, now)).toBe(null);
  });
  it("groups fetches and falls back when data is missing", async () => {
    const now = Date.UTC(2026, 9, 13); const t0 = now - 10 * 86400e3; let calls = 0;
    const ambs = [0, 1, 2].map((k) => ({ key: `k${k}`, i: k, t: t0 + k * 4 * H, kind: "exit" as const, dir: "long" as const, stop: 98, tgt: 102 }));
    const f = async (_s: string, _l: any, a: number, b: number) => { calls++; const out: Candle[] = []; for (let t = a; t <= b; t += 3e5) out.push(bar(t, 100, 102.5, 99, 100)); return out; };
    const r = await magnify("BTC", "4h", ambs, {}, f as any, now); expect(calls).toBe(1); expect(Object.values(r.resolved)).toEqual(["tp", "tp", "tp"]);
    const fail = async () => { throw new Error("429"); }; const r2 = await magnify("ETH", "4h", ambs, {}, fail as any, now); expect(r2.stats.resolved).toBe(0);
  });
});
describe("unseen-data verdict and Monte Carlo", () => {
  const tr = (rs: number[]) => rs.map((r) => ({ r, pct: r }));
  it("verdicts", () => {
    expect(verdict(half(tr(Array(10).fill(1))), half(tr(Array(30).fill(1)))).label).toBe("Too few trades");
    expect(verdict(half(tr(Array(30).fill(0.4))), half(tr(Array(25).fill(0.3)))).label).toBe("Held up");
    expect(verdict(half(tr(Array(30).fill(0.4))), half(tr(Array(25).fill(-0.1)))).label).toBe("Fell apart");
    expect(verdict(half(tr(Array(30).fill(0.4))), half(tr(Array(25).fill(0.1)))).label).toBe("Fell apart");
  });
  it("percentiles are ordered, repeatable, and shuffle keeps the total", () => {
    const t = tr([2, -1, -1, 2, -1, 3, -1, -1, 2, -1, -1, -1, 2, 2, -1, -1, 2, -1, -1, 2]);
    const a = monteCarlo(t, 500, 3)!, b = monteCarlo(t, 500, 3)!; expect(a).toEqual(b);
    expect(a.ret[0]).toBeLessThanOrEqual(a.ret[1]); expect(a.ret[1]).toBeLessThanOrEqual(a.ret[2]); expect(a.ddR[2]).toBeGreaterThanOrEqual(a.ddR[0]);
    expect(a.fan.p50).toHaveLength(20); expect(a.shuffleDdR95).toBeGreaterThanOrEqual(3);
  });
});
