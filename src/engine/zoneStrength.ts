/**
 * Zone strength: Strong / OK / Weak for one entry zone.
 *
 * Display only. Callers must not feed the label back into zone selection,
 * stops, targets, rank, `shown`, or direction confidence. The forward test
 * does not read this module. The rule is also written in docs/ZONE_STRENGTH.md.
 *
 * Points (deterministic):
 * - Real structure (OB, FVG, breaker, swing) +2. Standalone liq cluster +1.
 *   ATR step +0 and the label is forced to Weak.
 * - Liquidation cluster merged onto real structure +2. Stop nudged past a cluster +1.
 * - Distance of the near edge: <= 1 ATR +2, <= 2 ATR +1, else 0. Price inside the zone is 0 ATR.
 * - Freshness: breaker 0 retests +2, 1 retest +1. OB/FVG/swing age <= 20 bars +2, <= 60 +1.
 * - Signal agreement (not a win chance, not a second confidence): structure signal on and passing +1,
 *   and the signal that matches this level's kind on and passing +1.
 * Strong >= 6, OK >= 3, otherwise Weak.
 */
export type ZoneKind = "OB" | "FVG" | "Breaker" | "Swing" | "Liq" | "ATR";
export type ZoneGrade = "Strong" | "OK" | "Weak";
export type ZoneFacts = {
  kind: ZoneKind;
  /** Near-edge distance from price, in ATRs. 0 when price is inside the zone. */
  distAtr: number;
  ageBars: number;
  /** Breaker retests only. Null for every other kind. */
  retests: number | null;
  liqOnStructure: boolean;
  stopNudged: boolean;
  /** Structure (BoS/ChoCH) signal is on and passes. Per setup, applied to each zone. */
  structureAgrees: boolean;
  /** The signal for this kind (FVG/OB, breaker, or swings) is on and passes. */
  kindAgrees: boolean;
};
export type ZoneGradeResult = { grade: ZoneGrade; score: number; why: string };

export const STRONG_AT = 6;
export const OK_AT = 3;

const KIND_WORD: Record<ZoneKind, string> = {
  OB: "order block",
  FVG: "fair value gap",
  Breaker: "breaker",
  Swing: "swing",
  Liq: "liq cluster beside structure",
  ATR: "no structure",
};

export function zoneScore(f: ZoneFacts): number {
  let s = 0;
  if (f.kind === "OB" || f.kind === "FVG" || f.kind === "Breaker" || f.kind === "Swing") s += 2;
  else if (f.kind === "Liq") s += 1;
  if (f.liqOnStructure) s += 2;
  if (f.stopNudged) s += 1;
  if (f.distAtr <= 1) s += 2;
  else if (f.distAtr <= 2) s += 1;
  if (f.kind === "Breaker") {
    if (f.retests === 0) s += 2;
    else if (f.retests === 1) s += 1;
  } else if (f.kind === "OB" || f.kind === "FVG" || f.kind === "Swing") {
    if (f.ageBars <= 20) s += 2;
    else if (f.ageBars <= 60) s += 1;
  }
  if (f.structureAgrees) s += 1;
  if (f.kindAgrees) s += 1;
  return s;
}

export function gradeZone(f: ZoneFacts): ZoneGradeResult {
  const score = zoneScore(f);
  const grade: ZoneGrade = f.kind === "ATR" || score < OK_AT ? "Weak" : score >= STRONG_AT ? "Strong" : "OK";
  return { grade, score, why: zoneWhy(f) };
}

/** Plain reason for a tooltip. The product shows the grade word, not the point count. */
export function zoneWhy(f: ZoneFacts): string {
  const bits = [KIND_WORD[f.kind], `${f.distAtr.toFixed(1)} ATR away`];
  if (f.kind === "Breaker" && f.retests != null) bits.push(f.retests === 0 ? "untouched" : f.retests === 1 ? "1 touch" : `${f.retests} touches`);
  else if (f.kind === "OB" || f.kind === "FVG" || f.kind === "Swing") bits.push(f.ageBars <= 20 ? "fresh" : f.ageBars <= 60 ? "recent" : "older");
  if (f.liqOnStructure) bits.push("liquidation cluster on the level");
  if (f.stopNudged) bits.push("stop past a cluster");
  bits.push(f.structureAgrees ? "structure agrees" : "structure does not agree");
  if (f.kindAgrees) bits.push("this level's signal agrees");
  return bits.join(", ");
}
