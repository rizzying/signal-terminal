import type { Trade } from "./db";
export type Row = { key: string; n: number; wins: number; winRate: number; avgR: number | null };
function agg(groups: Map<string, Trade[]>): Row[] {
  return [...groups].map(([key, ts]) => {
    const closed = ts.filter((t) => t.pnl != null); const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
    const rs = ts.map((t) => t.r).filter((r): r is number => r != null && Number.isFinite(r));
    return { key, n: closed.length, wins, winRate: closed.length ? wins / closed.length : 0, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null };
  }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
}
const by = (ts: Trade[], f: (t: Trade) => string[]) => { const m = new Map<string, Trade[]>(); for (const t of ts) for (const k of f(t)) m.set(k, [...(m.get(k) ?? []), t]); return agg(m); };
export const band = (c?: number) => (c == null ? "No score" : c >= 80 ? "P80–100" : c >= 65 ? "P65–79" : c >= 50 ? "P50–64" : "Below P50");
export function stats(ts: Trade[]) {
  return {
    overall: agg(new Map([["All trades", ts]])),
    bySignal: by(ts, (t) => (t.signals.length ? t.signals : ["(none recorded)"])),
    byConfidence: by(ts, (t) => [band(t.confidence)]),
    byEmotion: by(ts, (t) => [t.emotion ?? "untagged"]),
    byPlan: by(ts, (t) => [t.followedPlan == null ? "not marked" : t.followedPlan ? "followed plan" : "broke plan"]),
  };
}
