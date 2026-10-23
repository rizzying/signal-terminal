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
 * A trigger seen on a candle that also hits the stop does not arm in stopFirst.
 * favorableFirst is the other reading of that same candle, reported only as a sensitivity.
 * The fill candle can stop the trade and cannot arm a trigger: its wick may be from before the fill.
 * Breakeven and the trail apply from the next candle. A partial is a maker fill at a gross R level.
 * "Breakeven" moves the stop to the entry price; fees and stop slippage still make that exit a small loss.
 */
export function replay(leg: Leg, candles: Candle[], variant: Variant, mode: Mode): Replay {
  return replayRule(leg, candles, ruleFromVariant(variant), mode);
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

/**
 * One exit rule. Null means that knob is off.
 * A partial is a maker fill at a gross R level, then the stop on the rest moves to entry.
 * A target multiple uses the cost padding baked into the stored 3R price. Null target keeps that stored price.
 * The trail distance is in R behind the best price, and it arms only after `trailArm` R of favorable travel.
 */
export type Rule = {
  timeBars: number | null;
  trailArm: number | null;
  trailDist: number | null;
  beArm: number | null;
  partialFrac: number | null;
  partialAt: number | null;
  targetR: number | null;
};
export const blankRule = (): Rule => ({ timeBars: null, trailArm: null, trailDist: null, beArm: null, partialFrac: null, partialAt: null, targetR: null });

export function ruleFromVariant(variant: Variant): Rule {
  const r = blankRule();
  if (variant === "be05") r.beArm = 0.5;
  else if (variant === "be10") r.beArm = 1;
  else if (variant === "partial1") { r.partialFrac = 0.5; r.partialAt = 1; }
  else if (variant === "trail1") { r.trailArm = 1; r.trailDist = 1; }
  else if (variant === "tp15") r.targetR = 1.5;
  else if (variant === "tp20") r.targetR = 2;
  else if (variant === "time8") r.timeBars = 8;
  else if (variant === "time16") r.timeBars = 16;
  return r;
}

export function ruleLabel(rule: Rule): string {
  const bits: string[] = [];
  if (rule.beArm != null) bits.push(`stop to entry after +${rule.beArm}R`);
  if (rule.partialFrac != null && rule.partialAt != null) bits.push(`${Math.round(rule.partialFrac * 100)}% off at +${rule.partialAt}R, then entry`);
  if (rule.trailArm != null && rule.trailDist != null) bits.push(`after +${rule.trailArm}R, trail ${rule.trailDist}R behind`);
  if (rule.targetR != null) bits.push(`target at ${rule.targetR}R`);
  if (rule.timeBars != null) bits.push(`exit after ${rule.timeBars} bars`);
  return bits.length ? bits.join("; ") : "stored target";
}

/** Grids fixed before the sweep was run. Smaller parameters are listed first so a tie keeps the smaller one. */
export const TIME_BARS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32] as const;
export const R_LEVELS = [0.5, 1, 1.5, 2] as const;
export const PARTIAL_FRACS = [0.25, 0.5, 0.75] as const;
export const TARGET_RS = [1, 1.5, 2, 2.5, 3] as const;
export const TRAIL_TIME_BARS = [8, 16, 24, 32] as const;

const withRule = (p: Partial<Rule>): Rule => ({ ...blankRule(), ...p });
export const SWEEP: { family: string; rules: Rule[] }[] = [
  { family: "Time exit", rules: TIME_BARS.map((timeBars) => withRule({ timeBars })) },
  { family: "Trailing stop", rules: R_LEVELS.flatMap((trailArm) => R_LEVELS.map((trailDist) => withRule({ trailArm, trailDist }))) },
  { family: "Breakeven", rules: R_LEVELS.map((beArm) => withRule({ beArm })) },
  { family: "Partial, then breakeven", rules: PARTIAL_FRACS.flatMap((partialFrac) => R_LEVELS.map((partialAt) => withRule({ partialFrac, partialAt }))) },
  { family: "Fixed target", rules: TARGET_RS.map((targetR) => withRule({ targetR })) },
  { family: "Trail plus time cap", rules: R_LEVELS.flatMap((trailArm) => R_LEVELS.flatMap((trailDist) => TRAIL_TIME_BARS.map((timeBars) => withRule({ trailArm, trailDist, timeBars })))) },
];

/**
 * Replay one filled trade under a parameterized rule. Same candle order as `replay`.
 * Stop is checked before any trigger. A trigger on a candle that also hits the stop does not arm in stopFirst.
 * The fill candle can stop the trade and cannot arm a trigger. Breakeven, a partial, and a trail apply from the next candle.
 */
export function replayRule(leg: Leg, candles: Candle[], rule: Rule, mode: Mode): Replay {
  const bar = leg.barMs; const L = leg.side === "long"; const sign = sg(leg.side);
  const ks = [...candles].sort((a, b) => a.t - b.t);
  const fill = ks.find((k) => k.t === leg.fillT - bar);
  if (!fill || !(leg.risk > 0)) return { r: null, reason: "open", exitT: null, ambiguous: false, missing: true };
  const hitStop = (k: Candle, sl: number) => (L ? k.l <= sl : k.h >= sl);
  const hitTp = (k: Candle, px: number) => (L ? k.h >= px + buffer(px, leg.market) : k.l <= px - buffer(px, leg.market));
  const favR = (k: Candle) => (sign * ((L ? k.h : k.l) - leg.entry)) / leg.risk;
  const tgt = rule.targetR == null ? leg.tp : targetAt(leg, rule.targetR);
  const partialPx = rule.partialAt == null ? null : roundTick(leg.entry + sign * rule.partialAt * leg.risk, tickOf(leg.market));
  const frac = rule.partialFrac ?? 0;
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
    const dist = rule.trailDist ?? 0;
    const trailNext = L ? favPx - dist * leg.risk : favPx + dist * leg.risk;
    const wantBe = rule.beArm != null && fr >= rule.beArm - 1e-9 && tighter(leg.side, stop, leg.entry) !== stop;
    const wantPartial = partialPx != null && frac > 0 && !partialDone && hitTp(k, partialPx);
    const wantTrail = rule.trailArm != null && rule.trailDist != null && fr >= rule.trailArm - 1e-9 && tighter(leg.side, stop, trailNext) !== stop;
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
      if (wantPartial) { banked += frac * closeR(leg, partialPx!, "tp"); size = 1 - frac; return finish(k, stopPx(leg.side, k.o, leg.entry, leg.market), "sl", "be"); }
      if (wantBe) return finish(k, stopPx(leg.side, k.o, leg.entry, leg.market), "sl", "be");
      return finish(k, stopPx(leg.side, k.o, tighter(leg.side, stop, trailNext), leg.market), "sl", "trail");
    }
    if (seeTp) return finish(k, tgt, "tp", "tp");
    if (rule.timeBars != null && held >= rule.timeBars) return finish(k, k.c, "sl", "time");
    if (wantPartial) { banked += frac * closeR(leg, partialPx!, "tp"); size = 1 - frac; partialDone = true; stop = tighter(leg.side, stop, leg.entry); kind = kind === "trail" ? "trail" : "be"; }
    if (wantBe) { stop = tighter(leg.side, stop, leg.entry); if (kind === "sl") kind = "be"; }
    if (wantTrail) { stop = tighter(leg.side, stop, trailNext); kind = "trail"; }
  }
  return { r: null, reason: "open", exitT: null, ambiguous, missing: false };
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

/** The paper book has one display size for every trade: $100 per 1R (Settings › Labs, default). Price distance differs by coin; dollar results are R times this. */
export const USD_PER_R = 100;

/** Profit-to-drawdown. Drawdown is negative. A flat curve with a profit ranks above every finite ratio; a flat curve with a loss ranks below. */
export function profitDdRatio(totalR: number, maxDdR: number): number {
  if (!(maxDdR < 0)) return totalR > 0 ? Infinity : totalR < 0 ? -Infinity : 0;
  return totalR / Math.abs(maxDdR);
}

/** Consecutive trades with R at or below zero, in exit-time order. */
export function longestLoseStreak(rs: number[]): number {
  let best = 0; let cur = 0;
  for (const r of rs) { if (r <= 0) { cur++; if (cur > best) best = cur; } else cur = 0; }
  return best;
}

export type RiskScore = {
  n: number; totalR: number; totalUsd: number; maxDdR: number; maxDdUsd: number;
  worstR: number | null; worstUsd: number | null; loseStreak: number; ratio: number; early: boolean;
};
export function riskScore(rows: { r: number; exitT: number }[], usdPerR = USD_PER_R): RiskScore {
  const xs = [...rows].sort((a, b) => a.exitT - b.exitT).map((x) => x.r);
  const n = xs.length;
  const totalR = xs.reduce((a, r) => a + r, 0);
  const dd = n ? maxDdR(xs) : 0;
  const worstR = n ? Math.min(...xs) : null;
  return {
    n, totalR, totalUsd: totalR * usdPerR, maxDdR: dd, maxDdUsd: dd * usdPerR,
    worstR, worstUsd: worstR == null ? null : worstR * usdPerR,
    loseStreak: longestLoseStreak(xs), ratio: n ? profitDdRatio(totalR, dd) : 0, early: n < 30,
  };
}

/** True when `a` should replace `b`. Higher profit-to-drawdown, then higher profit, then a shallower drawdown. A tie keeps the earlier setting. */
export function betterRisk(a: RiskScore, b: RiskScore): boolean {
  if (a.ratio !== b.ratio) return a.ratio > b.ratio;
  if (a.totalR !== b.totalR) return a.totalR > b.totalR;
  return Math.abs(a.maxDdR) < Math.abs(b.maxDdR);
}

/** Higher profit, then higher profit-to-drawdown, then a shallower drawdown. */
export function betterProfit(a: RiskScore, b: RiskScore): boolean {
  if (a.totalR !== b.totalR) return a.totalR > b.totalR;
  if (a.ratio !== b.ratio) return a.ratio > b.ratio;
  return Math.abs(a.maxDdR) < Math.abs(b.maxDdR);
}

export function chooseBest<T>(items: { id: T; rows: { r: number; exitT: number }[] }[]): { id: T; score: RiskScore } | null {
  let best: { id: T; score: RiskScore } | null = null;
  for (const it of items) {
    const s = riskScore(it.rows);
    if (!best || betterRisk(s, best.score)) best = { id: it.id, score: s };
  }
  return best;
}

/** First floor(n × 2/3) trades by fill time are the tune set. The rest are the check. */
export function chronoSplit<T extends { fillT: number; id: string }>(rows: T[], trainFrac = 2 / 3): { train: T[]; test: T[] } {
  const s = [...rows].sort((a, b) => a.fillT - b.fillT || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = Math.floor(s.length * trainFrac);
  return { train: s.slice(0, n), test: s.slice(n) };
}
