import { expect, test } from "vitest";
import { shadowReplay, shadowSummary, SH } from "../src/forward/shadow.js";
import { step, settle, SPEC, rulesHash, LEGACY_SPEC, type Trade, type State } from "../src/forward/trader";
const H = 3.6e6;
test("shadow constants mirror the frozen strategy (and the rules hash is unchanged)", () => {
  expect(SH.ttlBars).toBe(SPEC.ttlBars); expect(SH.tradeThroughPct).toBe(SPEC.fill.tradeThroughPct);
  for (const k of ["makerPct", "takerPct", "spreadPct", "stopSlipPct"] as const) expect(SH[k]).toBe(SPEC.costs[k]);
  expect(rulesHash(LEGACY_SPEC)).toBe("b81ceeeb"); expect(rulesHash()).not.toBe("b81ceeeb");
});
test("ETH #2 (placed 15:00 WIB 14 Oct, entry 2496.29, cancelled 16:00) would have filled", () => {
  const t = { id: "2", market: "ETHUSDT", side: "long", placed_t: "1791964800000", exit_t: "1791968400000", entry: 2496.29, sl: 2470.24, tp: 2576.92, risk: 26.05 };
  expect(new Date(1791964800000 + 7 * H).toISOString().slice(0, 16)).toBe("2026-10-14T15:00");
  const K = [{ t: 1791968400000, o: 2506.04, h: 2509.2, l: 2495.11, c: 2497.04 }, { t: 1791972000000, o: 2497.05, h: 2504.83, l: 2479.31, c: 2502.54 }];
  const s = shadowReplay(t, K); expect(s.fill_t).toBe(1791968400000 + H); expect(s.status).toBe("open"); expect(s.r).toBeNull();
  expect(shadowReplay(t, K.slice(0, 0)).status).toBe("waiting");
  expect(shadowSummary([s])).toMatchObject({ cancelled: 1, filled: 1, closed: 0, netR: 0, open: 1 });
});
// Cross-check: the replay must give the same result as the real trader keeping the order alive (plans = same order every candle).
const M = "BTCUSDT"; const base = 1.7e12;
const ord = (side: "long" | "short", entry: number, sl: number, tp: number, bars: number): Trade => ({ market: M, side, status: "pending", placed_t: base, entry, sl, tp, risk: Math.abs(entry - sl), conf: 1, replaced: 0, fill_t: null, exit_t: null, exit_px: null, exit_reason: null, bars, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null });
function trader(o: Trade, K: any[]) { let st: State = { order: o, pos: null }; const plan = [{ side: o.side, entry: o.entry, sl: o.sl, tp: o.tp, atr: 1000, conf: 1 }];
  for (const k of K) { const r = step(st, k, plan, M); for (const c of r.closed) if (c.status === "closed" || c.status === "expired") return c; if (r.state.order?.placed_t !== base && !r.state.pos) return null; st = r.state; } return st.pos ? "open" : "waiting"; }
const cases: [string, "long" | "short", [number, number, number, number][]][] = [
  ["long tp", "long", [[101, 102, 100.5, 101], [101, 101, 99.9, 100], [100, 111, 99.5, 110.5]]],
  ["long sl in fill candle", "long", [[100.5, 101, 94, 95]]],
  ["long sl later with gap", "long", [[100.5, 101, 99.8, 100], [94, 94.5, 93, 94]]],
  ["short tp", "short", [[99, 100.1, 98, 99], [99, 99.5, 89, 89.5]]],
  ["touch only, not a fill", "long", [[101, 101, 100, 100.5]]],
];
for (const [name, side, raw] of cases) test(`replay matches trader: ${name}`, () => {
  const [entry, sl, tp] = side === "long" ? [100, 95, 110] : [100, 105, 90]; const cancel = base + 2 * H;
  const K = raw.map(([o, h, l, c], i) => ({ t: cancel + i * H, o, h, l, c, v: 1 }));
  const s = shadowReplay({ market: M, side, entry, sl, tp, risk: 5, placed_t: base, exit_t: cancel }, K); const r = trader(ord(side, entry, sl, tp, 2), K);
  if (typeof r === "string") expect(s.status).toBe(r); else { expect(s.status).toBe(r!.exit_reason); expect(s.exit_px).toBe(r!.exit_px); expect(s.r).toBeCloseTo(r!.r_gross! - r!.cost_r!, 10); }
});
test("expiry counts 24 bars from placement, not from the cancel", () => {
  const cancel = base + 22 * H; const K = [0, 1, 2].map((i) => ({ t: cancel + i * H, o: 101, h: 102, l: 100.5, c: 101 }));
  const s = shadowReplay({ market: M, side: "long", entry: 100, sl: 95, tp: 110, risk: 5, placed_t: base, exit_t: cancel }, K); expect(s.status).toBe("expired"); expect(s.exit_t).toBe(cancel + 2 * H);
});
