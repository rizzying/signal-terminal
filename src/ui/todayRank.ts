/** Today page: one shown setup per coin, best first. No padding. */
export const TODAY_COIN_CAP = 12;

export type SideBrief = { dir: "long" | "short"; confidence: number; shown: boolean; rr: number };

/** Current symbol first, then the watchlist, unique, capped. */
export function todaySymbols(current: string, watch: string[], cap = TODAY_COIN_CAP): string[] {
  const out: string[] = [];
  for (const raw of [current, ...watch]) {
    const s = raw.trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** The side that passes the setup rule. Higher confidence, then R:R, then long on a tie. Null when neither side is a setup. */
export function bestShown(long: SideBrief | null, short: SideBrief | null): "long" | "short" | null {
  const ok = [long, short].filter((s): s is SideBrief => !!s && s.shown);
  if (!ok.length) return null;
  ok.sort((a, b) => b.confidence - a.confidence || b.rr - a.rr || (a.dir === "long" ? -1 : 1));
  return ok[0].dir;
}

export function rankShown<T extends { symbol: string; confidence: number; rr: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => b.confidence - a.confidence || b.rr - a.rr || a.symbol.localeCompare(b.symbol));
  const seen = new Set<string>();
  return sorted.filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true)));
}

/** Plain sentence when fewer than three different coins have a setup. Null when there are three or more. */
export function shortfall(n: number): string | null {
  if (n >= 3) return null;
  if (n === 0) return "No coins have a setup right now.";
  if (n === 1) return "Only 1 coin has a setup right now.";
  return `Only ${n} coins have a setup right now.`;
}
