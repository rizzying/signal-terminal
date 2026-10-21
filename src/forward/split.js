import { confidenceCuts } from "../engine/bands.js";
import { FIRST_READ, isWin, tradeId, tstatus } from "./paper.js";
import { reportBooks } from "./books.js";

export const SPLITS = [
  { key: "strength", title: "Zone strength", levels: ["Strong", "OK", "Weak", "Unknown"] },
  { key: "conf", title: "Confidence", levels: ["Low", "Med", "High", "Unknown"] },
];
const REPORT_BAND = { Low: "Low", Medium: "Med", High: "High" };
export function confBand(conf) {
  if (conf == null || conf === "") return "Unknown";
  const n = Number(conf);
  return !Number.isFinite(n) ? "Unknown" : REPORT_BAND[confidenceCuts(n)];
}
const WORD = { entry: "entry", sl: "stop", tp: "target", conf: "confidence" };
const DETAIL = {
  rules: (f) => `Placed under rules ${f.hash}, not this card's ${f.want}.`,
  moved: (f) => `Moved ${f.replaced === 1 ? "once" : `${f.replaced} times`} after it was placed, so its placed prices are gone.`,
  "no-conf": () => "No confidence was stored, so the replay can't be checked.",
  candles: (f) => `Binance returned ${f.got} of 400 candles before it was placed.`,
  "no-setup": (f) => `The replay shows no ${f.side} setup at Zone ${f.zone}.`,
  mismatch: (f) => `The replay gave ${f.fields.map((k) => `${WORD[k]} ${f.replay[k] ?? "none"}, stored ${f.stored[k]}`).join("; ")}.`,
  "not-graded": () => "Not graded yet. The next hourly run grades it.",
};
function placedOf(t, g) {
  const reason = !g ? "not-graded" : g.verdict === "ok" ? null : g.verdict;
  return { t, r: Number(t.r_net), strength: reason ? "Unknown" : g.strength, conf: confBand(t.conf), reason, detail: reason && DETAIL[reason](g?.facts ?? {}) };
}
function slice(level, rs) {
  const n = rs.length, wins = rs.filter(isWin).length, totalR = rs.reduce((a, r) => a + r, 0);
  return { level, n, wins, winRate: n ? wins / n : null, avgR: n ? totalR / n : null, totalR, early: n < FIRST_READ };
}
/** Per report book id: { strength, conf, unknown }. trades are fwd_trades rows as /api/paper selects them; grades are fwd_grades rows. */
export function splitBoards(trades, grades, metas = reportBooks()) {
  if (trades.length && !("key" in trades[0] && "conf" in trades[0])) throw new Error("splitBoards needs fwd_trades.key and fwd_trades.conf");
  const byKey = new Map(grades.map((g) => [g.key, g]));
  return Object.fromEntries(metas.map((m) => {
    const P = trades.filter((t) => t.strategy === m.id).map((t) => placedOf(t, byKey.get(t.key)));
    const closed = P.filter((p) => p.t.status === "closed");
    const axes = Object.fromEntries(SPLITS.map((a) => [a.key, a.levels.map((l) => slice(l, closed.filter((p) => p[a.key] === l).map((p) => p.r)))]));
    const unknown = P.filter((p) => p.reason).sort((a, b) => Number(a.t.placed_t) - Number(b.t.placed_t)).map(({ t, reason, detail }) => ({
      id: tradeId(t), key: t.key, market: t.market, side: t.side, status: t.status, tstatus: tstatus(t), placed_t: Number(t.placed_t), reason, detail }));
    return [m.id, { ...axes, unknown }];
  }));
}
