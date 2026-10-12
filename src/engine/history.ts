import type { Candle } from "./indicators";
import { scan, type Dir } from "./scan";
import type { Settings } from "./settings";

export type HistStats = { dir: Dir; setups: number; filled: number; tp1: number; stopped: number; open: number; hitRate: number | null; expR: number | null; avgRR: number | null; bars: number };
/**
 * "What happened next": walk forward through the loaded candles. Each time the setup rule is met,
 * wait up to `fillBars` for price to reach Zone 1, then see whether TP1 or the stop is hit first.
 * Same-bar TP+stop counts as a stop (conservative). One trade at a time.
 */
export async function whatHappened(c: Candle[], dir: Dir, s: Settings, o: { warmup?: number; fillBars?: number; maxBars?: number; yieldEvery?: number } = {}): Promise<HistStats> {
  const warm = o.warmup ?? 100, fillBars = o.fillBars ?? 20, maxBars = o.maxBars ?? 100, ye = o.yieldEvery ?? 25;
  let setups = 0, filled = 0, tp1 = 0, stopped = 0, open = 0, rrSum = 0, rSum = 0; let i = warm;
  while (i < c.length - 1) {
    if ((i - warm) % ye === 0) await new Promise((r) => setTimeout(r, 0));
    let st; try { st = scan(c.slice(0, i + 1), dir, { ...s, useHtf: false }); } catch { i++; continue; }
    if (!st.shown) { i++; continue; }
    setups++; const z = st.zones[0]; const long = dir === "long";
    let j = i + 1, entered = -1;
    for (; j < Math.min(c.length, i + 1 + fillBars); j++) if (c[j].l <= z.top && c[j].h >= z.bottom) { entered = j; break; }
    if (entered < 0) { i = j; continue; }
    filled++; rrSum += z.rr1; let k = entered, done = false;
    for (; k < Math.min(c.length, entered + maxBars); k++) {
      const hitStop = long ? c[k].l <= z.stop : c[k].h >= z.stop; const hitTp = long ? c[k].h >= z.t1 : c[k].l <= z.t1;
      if (hitStop) { stopped++; rSum -= 1; done = true; break; }
      if (hitTp && k > entered) { tp1++; rSum += z.rr1; done = true; break; }
    }
    if (!done) open++;
    i = k + 1;
  }
  const closed = tp1 + stopped;
  return { dir, setups, filled, tp1, stopped, open, hitRate: closed ? tp1 / closed : null, expR: closed ? rSum / closed : null, avgRR: filled ? rrSum / filled : null, bars: c.length - warm };
}
