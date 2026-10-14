import { resolveSnap } from "../src/forward/core";
import { progress, nextRunLabel } from "../src/forward/view.js";
const M = 9e5; // 15m
const k = (i: number, o: number, h: number, l: number, c: number) => ({ t: i * M, o, h, l, c, v: 1 });
it("tiny-price long (PUMP-like 0.004959–0.005012): fills on the first closed candle after the snapshot that overlaps the zone", () => {
  const sn = { candle_t: 0, side: "long" as const, entry_top: 0.005012, entry_bottom: 0.004959, sl: 0.0049, tp1: 0.00515, tp2: 0.0052 };
  const snapCandle = k(0, 0.00503, 0.00504, 0.005, 0.00502); // overlaps, but it is the snapshot candle itself → never a fill
  expect(resolveSnap(sn, [snapCandle]).status).toBe("pending");
  expect(resolveSnap(sn, [snapCandle, k(1, 0.00503, 0.00504, 0.0050121, 0.00503)]).status).toBe("pending"); // low just above top
  expect(resolveSnap(sn, [snapCandle, k(1, 0.00503, 0.00504, 0.0050121, 0.00503), k(2, 0.00503, 0.00503, 0.005012, 0.00502)])).toMatchObject({ status: "open", fill_t: 2 * M, bars: 2 }); // touches top exactly
  const short = { ...sn, side: "short" as const, entry_top: 0.005012, entry_bottom: 0.004959, sl: 0.00508, tp1: 0.0048, tp2: 0.0047 };
  expect(resolveSnap(short, [k(1, 0.0049, 0.004959, 0.0048999, 0.0049)]).fill_t).toBe(M);
});
it("bars left counts closed candles since the snapshot (and never more than the resolver saw)", () => {
  const s = { side: "long", tf: "15m", close_t: 4 * M, px: 0.00503, atr: 0.00002 } as any; const z = { entry_bottom: 0.004959, entry_top: 0.005012 };
  expect(progress(z, s, 0.0051, 4 * M + 1, undefined).barsLeft).toBe(24);
  expect(progress(z, s, 0.0051, 4 * M + 4 * M + 1, undefined).barsLeft).toBe(20); // four 15m candles closed since
  expect(progress(z, s, 0.0051, 4 * M + 1, undefined, 6).barsLeft).toBe(18);
  expect(progress(z, s, 0.00499, 4 * M + 1, undefined).inside).toBe(true);
  expect(nextRunLabel(Date.parse("2026-10-14T05:59:00Z"))).toBe("~13:09 WIB"); expect(nextRunLabel(Date.parse("2026-10-14T06:05:00Z"))).toBe("~13:09 WIB"); expect(nextRunLabel(Date.parse("2026-10-14T06:10:00Z"))).toBe("~14:09 WIB");
});
