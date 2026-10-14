// Turn grouped counts into plain rates for the Forward test page.
export type Row = { venue: string; symbol: string; tf: string; zone: number; conf_band: string; side: string; status: string; n: number };
export type Rates = { n: number; pending: number; expired: number; filled: number; open: number; withResult: number; tp1: number; tp2: number; sl: number; fillRate: number | null; tp1Rate: number | null; tp2Rate: number | null; slRate: number | null };
export function rates(rows: Row[]): Rates {
  const c = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.n, 0);
  const pending = c("pending"), expired = c("expired"), open = c("open"), tp1o = c("tp1_open"), tp1f = c("tp1"), tp2 = c("tp2"), sl = c("sl");
  const filled = open + tp1o + tp1f + tp2 + sl; const decided = filled + expired; const withResult = tp1o + tp1f + tp2 + sl; const finalTP2 = tp1f + tp2 + sl;
  const pct = (a: number, b: number) => (b ? (100 * a) / b : null);
  return { n: rows.reduce((a, r) => a + r.n, 0), pending, expired, filled, open, withResult, tp1: tp1o + tp1f + tp2, tp2, sl,
    fillRate: pct(filled, decided), tp1Rate: pct(tp1o + tp1f + tp2, withResult), tp2Rate: pct(tp2, finalTP2), slRate: pct(sl, withResult) };
}
export type Dim = "zone" | "tf" | "symbol" | "conf_band";
export const DIM_LABEL: Record<Dim, string> = { zone: "Zone", tf: "Timeframe", symbol: "Coin", conf_band: "Confidence" };
const ORDER: Record<Dim, (string | number)[]> = { zone: [1, 2, 3], tf: ["1h", "4h"], symbol: ["BTC", "ETH", "SOL"], conf_band: ["High", "Medium", "Low"] };
export const base = (s: string) => s.replace(/-USD$/, "");
export function by(rows: Row[], dim: Dim): { key: string; r: Rates }[] {
  const val = (r: Row) => (dim === "symbol" ? base(r.symbol) : r[dim]);
  return ORDER[dim].map((k) => ({ key: String(k), r: rates(rows.filter((r) => val(r) === k)) })).filter((x) => x.r.n > 0);
}
/** Below this many trades with a result, rates swing a lot; label them as a small sample. */
export const SMALL = 30;
