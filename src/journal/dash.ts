import type { Trade } from "./db";
import { type Row } from "./stats";
const WIB = 7 * 3.6e6;
export function equityCurve(ts: Trade[]) { let acc = 0; return [...ts].filter((t) => t.pnl != null).sort((a, b) => a.createdAt - b.createdAt).map((t) => ({ t: t.createdAt, v: (acc += t.pnl!) })); }
export function maxDrawdown(pts: { v: number }[]) { let peak = 0, dd = 0; for (const p of pts) { peak = Math.max(peak, p.v); dd = Math.min(dd, p.v - peak); } return dd; }
const agg = (ts: Trade[], f: (t: Trade) => string, order?: string[]): Row[] => {
  const m = new Map<string, Trade[]>(); for (const t of ts.filter((x) => x.pnl != null)) { const k = f(t); m.set(k, [...(m.get(k) ?? []), t]); }
  const rows = [...m].map(([key, g]) => { const wins = g.filter((t) => t.pnl! > 0).length; const rs = g.map((t) => t.r).filter((r): r is number => r != null && Number.isFinite(r)); return { key, n: g.length, wins, winRate: wins / g.length, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null }; });
  return order ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : rows.sort((a, b) => b.n - a.n);
};
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const SESSIONS = ["00–06", "06–12", "12–18", "18–24"];
export function dashboard(ts: Trade[]) {
  const wib = (t: Trade) => new Date(t.createdAt + WIB);
  const curve = equityCurve(ts); const closed = ts.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => t.pnl! > 0), losses = closed.filter((t) => t.pnl! < 0);
  const gw = wins.reduce((a, t) => a + t.pnl!, 0), gl = -losses.reduce((a, t) => a + t.pnl!, 0);
  return {
    curve, total: curve.at(-1)?.v ?? 0, maxDD: maxDrawdown(curve), n: closed.length, winRate: closed.length ? wins.length / closed.length : null, profitFactor: gl ? gw / gl : null,
    bySetup: agg(ts, (t) => (t.zone ? `${t.side} · Zone ${t.zone}` : `${t.side} · ${t.source === "manual" ? "manual" : "imported"}`)),
    byHour: agg(ts, (t) => SESSIONS[Math.floor(wib(t).getUTCHours() / 6)], SESSIONS),
    byWeekday: agg(ts, (t) => DAYS[(wib(t).getUTCDay() + 6) % 7], DAYS),
    biggestLosses: [...losses].sort((a, b) => a.pnl! - b.pnl!).slice(0, 3),
  };
}
