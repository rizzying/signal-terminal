/**
 * EXPERIMENTAL Elliott Wave overlay (display only).
 * Not used by scans, zone scoring, alerts, or the forward test. One possible mechanical count, not a signal.
 * Non-repainting: closed candles only, fixed 2×ATR(14) zigzag, a pivot is confirmed only after price has
 * reversed ≥ 2×ATR from it AND 2 more bars have closed. The unconfirmed last leg is ignored.
 */
import { atr, type Candle } from "./indicators";

export const EW_K = 2; export const EW_CONFIRM = 2;
export type EwPivot = { i: number; price: number; kind: "high" | "low"; confirmedAt: number };
export type EwLabel = { i: number; price: number; kind: "high" | "low"; text: string };
export type EwCount = { dir: "up" | "down"; labels: EwLabel[] };

/** Confirmed, strictly alternating ATR zigzag pivots. `candles` must be closed candles. */
export function ewPivots(c: Candle[], k = EW_K, confirm = EW_CONFIRM): EwPivot[] {
  const a = atr(c, 14); const out: EwPivot[] = [];
  let dir: 0 | 1 | -1 = 0; let hi = -1, lo = -1; // candidate extremes
  for (let j = 0; j < c.length; j++) {
    if (!(a[j] > 0)) continue;
    if (hi < 0 || c[j].h > c[hi].h) hi = j; if (lo < 0 || c[j].l < c[lo].l) lo = j;
    if (dir === 0) { // first leg: wait for a k×ATR swing in either direction
      if (c[hi].h - c[j].l >= k * a[hi] && j - hi >= confirm && hi < j) { out.push({ i: hi, price: c[hi].h, kind: "high", confirmedAt: j }); dir = -1; lo = j; for (let q = hi; q <= j; q++) if (c[q].l < c[lo].l) lo = q; }
      else if (c[j].h - c[lo].l >= k * a[lo] && j - lo >= confirm && lo < j) { out.push({ i: lo, price: c[lo].l, kind: "low", confirmedAt: j }); dir = 1; hi = j; for (let q = lo; q <= j; q++) if (c[q].h > c[hi].h) hi = q; }
      continue;
    }
    if (dir === 1) { // looking for a confirmed high
      if (c[hi].h - c[j].l >= k * a[hi] && j - hi >= confirm) { out.push({ i: hi, price: c[hi].h, kind: "high", confirmedAt: j }); dir = -1; lo = hi + 1; for (let q = hi + 1; q <= j; q++) if (c[q].l < c[lo].l) lo = q; }
    } else {
      if (c[j].h - c[lo].l >= k * a[lo] && j - lo >= confirm) { out.push({ i: lo, price: c[lo].l, kind: "low", confirmedAt: j }); dir = 1; hi = lo + 1; for (let q = lo + 1; q <= j; q++) if (c[q].h > c[hi].h) hi = q; }
    }
  }
  return out;
}

/** The 3 hard impulse rules on 6 alternating prices P0..P5 (up: P0 low; down: P0 high). */
export function impulseOk(p: number[], dir: "up" | "down"): boolean {
  if (p.length !== 6) return false; const s = dir === "up" ? 1 : -1; const v = p.map((x) => x * s);
  const l1 = v[1] - v[0], l3 = v[3] - v[2], l5 = v[5] - v[4];
  if (!(l1 > 0 && v[2] < v[1] && l3 > 0 && v[4] < v[3] && l5 > 0)) return false;
  if (!(v[2] > v[0])) return false;            // rule 1: wave 2 retraces < 100% of wave 1
  if (l3 < l1 && l3 < l5) return false;        // rule 2: wave 3 is not the shortest
  if (!(v[4] > v[1])) return false;            // rule 3: wave 4 does not overlap wave 1
  return true;
}

/** Latest valid 5-wave impulse among confirmed pivots, plus up to 3 confirmed A-B-C pivots after it. */
export function fitElliott(pivots: EwPivot[]): EwCount | null {
  for (let s = pivots.length - 6; s >= 0; s--) {
    const w = pivots.slice(s, s + 6); const dir = w[0].kind === "low" ? "up" : "down";
    if (!impulseOk(w.map((p) => p.price), dir)) continue;
    const labels: EwLabel[] = w.slice(1).map((p, n) => ({ i: p.i, price: p.price, kind: p.kind, text: String(n + 1) }));
    const corr = pivots.slice(s + 6, s + 9); const sg = dir === "up" ? 1 : -1;
    // A-B-C must stay a correction: B doesn't exceed wave 5's end
    for (let n = 0; n < corr.length; n++) { if (n === 1 && corr[1].price * sg >= w[5].price * sg) break; labels.push({ i: corr[n].i, price: corr[n].price, kind: corr[n].kind, text: "ABC"[n] }); }
    return { dir, labels };
  }
  return null;
}

/** Overlay entry point. Drops the last candle (may still be forming), so only closed candles are used. */
export function elliottOverlay(candles: Candle[]): EwCount | null { return fitElliott(ewPivots(candles.slice(0, -1))); }
