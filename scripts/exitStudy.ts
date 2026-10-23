// Read-only exit study. Nothing here is imported by the trader, the hourly job, or the page.
import type { Candle } from "../src/engine/indicators";
import { confidenceBand } from "../src/engine/scan";
import { roundTick } from "../src/api/markets";
import { excursion } from "../src/forward/shadow.js";
import { buffer, settle, SPEC, TICK, type Side, type Trade } from "../src/forward/trader";
import { maxDdR } from "../src/forward/paper.js";

export const MFE_LEVELS = [0.5, 1, 1.5, 2] as const;
export const VARIANTS = ["current", "be05", "be10", "partial1", "trail1", "tp15", "tp20", "time8", "time16"] as const;
export type Variant = (typeof VARIANTS)[number];
export type Mode = "stopFirst" | "favorableFirst";
export type ExitReason = "sl" | "tp" | "be" | "trail" | "time" | "open";
export type Replay = { r: number | null; reason: ExitReason; exitT: number | null; ambiguous: boolean; missing: boolean };
export type Leg = { market: string; side: Side; entry: number; sl: number; tp: number; risk: number; fillT: number; barMs: number };

const tickOf = (m: string) => TICK[m] ?? 0.01;
const sg = (side: Side) => (side === "long" ? 1 : -1);

/** Cost-padded target at `multiple` R, using the padding baked into the stored 3R target. Gross multiple if that padding is not a small positive. */
export function targetAt(leg: Leg, multiple: number): number {
  const pad = Math.abs(leg.tp - leg.entry) - 3 * leg.risk;
  const extra = pad > -0.25 * leg.risk && pad < leg.risk ? Math.max(0, pad) : 0;
  const raw = leg.side === "long" ? leg.entry + multiple * leg.risk + extra : leg.entry - multiple * leg.risk - extra;
  return roundTick(raw, tickOf(leg.market), leg.side === "long" ? "up" : "down");
}

function stopPx(side: Side, open: number, sl: number, market: string): number {
  const L = side === "long";
  const gap = L ? Math.min(open, sl) : Math.max(open, sl);
  return roundTick(gap * (1 - (L ? 1 : -1) * SPEC.costs.stopSlipPct / 100), tickOf(market));
}
function closeR(leg: Leg, exitPx: number, kind: "tp" | "sl"): number {
  const t: Trade = { market: leg.market, side: leg.side, status: "open", placed_t: 0, entry: leg.entry, sl: leg.sl, tp: leg.tp, risk: leg.risk, conf: 0, replaced: 0,
    fill_t: leg.fillT, exit_t: null, exit_px: null, exit_reason: null, bars: 0, r_gross: null, cost_r: null, funding_r: null, funding_src: null, r_net: null };
  return settle(t, exitPx, kind, leg.fillT).r_net!;
}
const tighter = (side: Side, stop: number, next: number) => (side === "long" ? Math.max(stop, next) : Math.min(stop, next));

/**
 * Replay one filled trade. Stop is checked before target, matching the live book.
 * A trigger (breakeven, partial, trail, nearer target) seen on a candle that also hits the stop
 * does not arm in stopFirst. favorableFirst is the other reading of that same candle, reported only as a sensitivity.
 * The fill candle can stop the trade and cannot arm a trigger: its wick may be from before the fill.
 * Breakeven and the trail apply from the next candle. A partial is a maker fill at +1R gross.
 * "Breakeven" moves the stop to the entry price; fees and stop slippage still make that exit a small loss.
 */
export function replay(leg: Leg, candles: Candle[], variant: Variant, mode: Mode): Replay {
  const bar = leg.barMs; const L = leg.side === "long"; const sign = sg(leg.side);
  const ks = [...candles].sort((a, b) => a.t - b.t);
  const fill = ks.find((k) => k.t === leg.fillT - bar);
  if (!fill || !(leg.risk > 0)) return { r: null, reason: "open", exitT: null, ambiguous: false, missing: true };
  const hitStop = (k: Candle, sl: number) => (L ? k.l <= sl : k.h >= sl);
  const hitTp = (k: Candle, px: number) => (L ? k.h >= px + buffer(px, leg.market) : k.l <= px - buffer(px, leg.market));
  const favR = (k: Candle) => (sign * ((L ? k.h : k.l) - leg.entry)) / leg.risk;
  const oneR = roundTick(leg.entry + sign * leg.risk, tickOf(leg.market));
  const beAt = variant === "be05" ? 0.5 : variant === "be10" ? 1 : null;
  const timeN = variant === "time8" ? 8 : variant === "time16" ? 16 : null;
  const tgt = variant === "tp15" ? targetAt(leg, 1.5) : variant === "tp20" ? targetAt(leg, 2) : leg.tp;
  let stop = leg.sl; let kind: "sl" | "be" | "trail" = "sl";
  let banked = 0; let size = 1; let partialDone = false; let ambiguous = false;
  const finish = (k: Candle, px: number, how: "tp" | "sl", reason: ExitReason): Replay =>
    ({ r: banked + size * closeR(leg, px, how), reason, exitT: k.t + bar, ambiguous, missing: false });

  if (hitStop(fill, stop)) return finish(fill, stopPx(leg.side, fill.o, stop, leg.market), "sl", "sl");

  let held = 0;
  for (const k of ks) {
    if (k.t < leg.fillT) continue;
    held++;
    const fr = favR(k);
    const favPx = L ? k.h : k.l;
    const trailNext = L ? favPx - leg.risk : favPx + leg.risk;
    const wantBe = beAt != null && fr >= beAt - 1e-9 && tighter(leg.side, stop, leg.entry) !== stop;
    const wantPartial = variant === "partial1" && !partialDone && hitTp(k, oneR);
    const wantTrail = variant === "trail1" && fr >= 1 - 1e-9 && tighter(leg.side, stop, trailNext) !== stop;
    const seeTp = hitTp(k, tgt);
    const triggered = wantBe || wantPartial || wantTrail || seeTp;
    const stopped = hitStop(k, stop);
    if (stopped && (mode === "stopFirst" || !triggered)) {
      if (triggered) ambiguous = true;
      return finish(k, stopPx(leg.side, k.o, stop, leg.market), "sl", kind);
    }
    if (stopped && triggered) {
      ambiguous = true;
      if (seeTp) return finish(k, tgt, "tp", "tp");
      if (wantPartial) { banked += 0.5 * closeR(leg, oneR, "tp"); size = 0.5; return finish(k, stopPx(leg.side, k.o, leg.entry, leg.market), "sl", "be"); }
      if (wantBe) return finish(k, stopPx(leg.side, k.o, leg.entry, leg.market), "sl", "be");
      return finish(k, stopPx(leg.side, k.o, tighter(leg.side, stop, trailNext), leg.market), "sl", "trail");
    }
    if (seeTp) return finish(k, tgt, "tp", "tp");
    if (timeN != null && held >= timeN) return finish(k, k.c, "sl", "time");
    if (wantPartial) { banked += 0.5 * closeR(leg, oneR, "tp"); size = 0.5; partialDone = true; stop = tighter(leg.side, stop, leg.entry); kind = kind === "trail" ? "trail" : "be"; }
    if (wantBe) { stop = tighter(leg.side, stop, leg.entry); if (kind === "sl") kind = "be"; }
    if (wantTrail) { stop = tighter(leg.side, stop, trailNext); kind = "trail"; }
  }
  return { r: null, reason: "open", exitT: null, ambiguous, missing: false };
}

/** Gross MFE in R and bars from the fill to the candle that made it. Same window as the page: fill candle skipped, exit candle included. */
export function pathMfe(leg: Leg, candles: Candle[], exitT: number | null): { mfe: number; barsToMfe: number | null } {
  let best = 0; let bars: number | null = null; const L = leg.side === "long"; const sign = sg(leg.side);
  for (const k of candles) {
    if (k.t < leg.fillT || (exitT != null && k.t >= exitT)) continue;
    const r = (sign * ((L ? k.h : k.l) - leg.entry)) / leg.risk;
    if (r > best + 1e-9) { best = r; bars = (k.t + leg.barMs - leg.fillT) / leg.barMs; }
  }
  return { mfe: best, barsToMfe: best > 0 ? bars : null };
}

export function mfeIncludingFill(leg: Leg, candles: Candle[], exitT: number | null): number {
  const fill = candles.find((k) => k.t === leg.fillT - leg.barMs);
  const base = pathMfe(leg, candles, exitT).mfe;
  if (!fill || !(leg.risk > 0)) return base;
  const L = leg.side === "long";
  const r = (sg(leg.side) * ((L ? fill.h : fill.l) - leg.entry)) / leg.risk;
  return Math.max(base, r);
}

/** A target touch on an earlier candle that did not also hit the stop should have closed the trade. Same-candle stop and target is the live rule, not a miss. */
export function targetAudit(leg: Leg, candles: Candle[], exitT: number | null): { missedTarget: boolean; missedStop: boolean; sameCandle: boolean } {
  let missedTarget = false; let missedStop = false; let sameCandle = false;
  const L = leg.side === "long";
  const hitStop = (k: Candle) => (L ? k.l <= leg.sl : k.h >= leg.sl);
  const hitTp = (k: Candle) => (L ? k.h >= leg.tp + buffer(leg.tp, leg.market) : k.l <= leg.tp - buffer(leg.tp, leg.market));
  for (const k of candles) {
    if (k.t < leg.fillT) continue;
    const close = k.t + leg.barMs;
    const isExit = exitT != null && close === exitT;
    if (isExit) { if (hitStop(k) && hitTp(k)) sameCandle = true; continue; }
    if (exitT != null && close > exitT) continue;
    if (hitTp(k) && !hitStop(k)) missedTarget = true;
    if (hitStop(k)) missedStop = true;
  }
  return { missedTarget, missedStop, sameCandle };
}

export function pageMfe(leg: Leg, candles: Candle[], exitT: number | null): number | null {
  const t = { side: leg.side, entry: leg.entry, sl: leg.sl, risk: leg.risk };
  return excursion(t, candles, leg.fillT, exitT, undefined).mfe;
}

export function confBand(conf: number | null): "Low" | "Med" | "High" | "Unknown" {
  if (conf == null || !Number.isFinite(conf)) return "Unknown";
  const w = confidenceBand(conf);
  return w === "Medium" ? "Med" : w;
}

export type Score = { n: number; wins: number; winRate: number | null; totalR: number; avgR: number | null; maxDdR: number; early: boolean };
export function score(rows: { r: number; exitT: number }[]): Score {
  const xs = [...rows].sort((a, b) => a.exitT - b.exitT).map((x) => x.r);
  const n = xs.length; const wins = xs.filter((r) => r > 0).length; const totalR = xs.reduce((a, r) => a + r, 0);
  return { n, wins, winRate: n ? wins / n : null, totalR, avgR: n ? totalR / n : null, maxDdR: n ? maxDdR(xs) : 0, early: n < 30 };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) / 2;
  return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2;
}
