import { whatHappened } from "../src/engine/history";
import { DEFAULTS, sanitize } from "../src/engine/settings";
import type { Candle } from "../src/engine/indicators";
const mk = (closes: number[]): Candle[] => closes.map((c, i) => { const o = i ? (closes[i - 1] + c) / 2 : c; return { t: i * 9e5, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: 10 }; });
it("replay counts are consistent", async () => {
  const c = mk(Array.from({ length: 300 }, (_, i) => 100 + 0.2 * i + 6 * Math.sin(i / 4)));
  const r = await whatHappened(c, "long", sanitize({ minOthers: 0, gateStructure: false }), { yieldEvery: 1000 });
  expect(r.setups).toBeGreaterThan(0); expect(r.filled).toBeLessThanOrEqual(r.setups);
  expect(r.tp1 + r.stopped + r.open).toBe(r.filled);
  if (r.hitRate != null) expect(r.hitRate).toBeGreaterThanOrEqual(0);
  const none = await whatHappened(c, "long", sanitize({ threshold: 100, minOthers: 6 }), { yieldEvery: 1000 }); expect(none.filled).toBeLessThanOrEqual(r.setups);
});
