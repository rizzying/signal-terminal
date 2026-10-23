// Read-only study of forward-test exits. Public /api/paper plus public Binance candles. No database writes.
// Run: npx tsx scripts/exit-study.ts
import { scan } from "../src/engine/scan";
import type { Candle } from "../src/engine/indicators";
import { plansByZone, SPEC } from "../src/forward/trader";
import { bookOf, reportBooks, TF_INTERVAL, TF_MS } from "../src/forward/books.js";
import { tradeId } from "../src/forward/paper.js";
import { confBand, median, mfeIncludingFill, pageMfe, pathMfe, replay, score, targetAudit, VARIANTS, type Leg, type Mode, type Replay, type Variant } from "./exitStudy";

const base = process.env.URL || "https://signal-terminal-psi.vercel.app";
const BOOKS = reportBooks();
const NAMES: Record<Variant, string> = {
  current: "Current (stop, then the stored target)",
  be05: "Stop to entry after +0.5R",
  be10: "Stop to entry after +1R",
  partial1: "50% off at +1R, stop to entry on the rest",
  trail1: "After +1R, trail the stop 1R behind the best price",
  tp15: "Target at 1.5R",
  tp20: "Target at 2R",
  time8: "Exit at the close after 8 bars",
  time16: "Exit at the close after 16 bars",
};

const get = async (qs: string) => {
  const r = await fetch(`${base}/api/paper${qs}`);
  if (!r.ok) throw new Error(`/api/paper${qs}: ${r.status}`);
  return r.json();
};
async function loadTrades() {
  const pages: { zone: string; tf: string }[] = [];
  for (const tf of ["15m", "1h", "4h"]) for (const zone of ["1", "2", "3"]) pages.push({ zone, tf });
  const by = new Map<string, any>();
  for (const p of pages) {
    const j = await get(`?zone=${p.zone}&tf=${p.tf}`);
    if (j.total > j.trades.length) throw new Error(`zone ${p.zone} ${p.tf}: ${j.total} trades but the page holds ${j.trades.length}`);
    for (const t of j.trades) by.set(t.key, t);
  }
  return [...by.values()];
}
async function klines(symbol: string, interval: string, from: number, to: number): Promise<Candle[]> {
  const by = new Map<number, Candle>();
  for (let start = from; start <= to;) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${to}&limit=1000`);
    if (!r.ok) throw new Error(`klines ${symbol} ${interval} ${r.status}`);
    const page: any[] = await r.json();
    for (const k of page) by.set(k[0], { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    if (page.length < 1000) break;
    const next = page.at(-1)[0] + 1;
    if (next <= start) break;
    start = next;
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

type Row = {
  id: string; book: string; tf: string; zone: number; side: "long" | "short"; reason: string;
  leg: Leg; conf: "Low" | "Med" | "High" | "Unknown"; strength: "Strong" | "OK" | "Weak" | "Unknown";
  storedMfe: number | null; storedNet: number | null; storedExCost: number | null; exitT: number | null;
  candles: Candle[];
};
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function strengthOf(candles: Candle[], t: any, tf: string, zone: number): "Strong" | "OK" | "Weak" | "Unknown" {
  const bar = TF_MS[tf]; const last = Number(t.placed_t) - bar;
  const win = candles.filter((k) => k.t <= last).slice(-SPEC.window);
  if (win.length !== SPEC.window || win.at(-1)!.t !== last) return "Unknown";
  const plan = (plansByZone(win, t.market, [zone])[zone] ?? []).find((p) => p.side === t.side);
  const conf = num(t.conf);
  if (!plan || conf == null || plan.entry !== +t.entry || plan.sl !== +t.sl || plan.tp !== +t.tp || plan.conf !== conf) return "Unknown";
  return scan(win, t.side, SPEC.settings, { costs: { spread: 0, feePct: SPEC.costs.zoneFeePct } }).zones.find((z) => z.rank === zone)?.strength ?? "Unknown";
}

const trades = await loadTrades();
const groups = new Map<string, any[]>();
for (const t of trades) {
  const b = bookOf(t.strategy); if (!b || num(t.fill_t) == null) continue;
  const k = `${t.market}|${b.tf}`; groups.set(k, [...(groups.get(k) ?? []), t]);
}
const candles = new Map<string, Candle[]>();
await Promise.all([...groups].map(async ([k, rs]) => {
  const [m, tf] = k.split("|"); const bar = TF_MS[tf];
  const from = Math.min(...rs.map((t) => Math.min(Number(t.placed_t) - (SPEC.window + 2) * bar, Number(t.fill_t) - 2 * bar)));
  const to = Math.max(...rs.map((t) => Math.max(Number(t.exit_t ?? t.fill_t), Number(t.fill_t) + 24 * bar)));
  candles.set(k, await klines(m, TF_INTERVAL[tf], from, to));
}));

const rows: Row[] = [];
for (const t of trades) {
  if (t.status !== "closed" || num(t.fill_t) == null || (t.exit_reason !== "sl" && t.exit_reason !== "tp")) continue;
  const b = bookOf(t.strategy); if (!b) continue;
  const bar = TF_MS[b.tf]; const fillT = Number(t.fill_t); const exitT = num(t.exit_t);
  const all = candles.get(`${t.market}|${b.tf}`) ?? [];
  const horizon = Math.max(exitT ?? 0, fillT + 24 * bar);
  const leg: Leg = { market: t.market, side: t.side, entry: +t.entry, sl: +t.sl, tp: +t.tp, risk: +t.risk, fillT, barMs: bar };
  const book = BOOKS.find((x) => x.id === t.strategy);
  rows.push({
    id: tradeId(t), book: book?.name ?? t.strategy, tf: b.tf, zone: b.zone, side: t.side, reason: t.exit_reason, leg,
    conf: confBand(num(t.conf)), strength: strengthOf(all, t, b.tf, b.zone),
    storedMfe: num(t.mfe), storedNet: num(t.r_net), storedExCost: num(t.r_net) == null ? null : num(t.r_net)! + (num(t.funding_r) ?? 0), exitT,
    candles: all.filter((k) => k.t >= fillT - bar && k.t < horizon),
  });
}

const play = (row: Row, v: Variant, mode: Mode): Replay => replay(row.leg, row.candles, v, mode);
const rr = (x: number | null, d = 2) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(d)}`);
const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const cell = (s: string, n: number) => s.padStart(n);
const lines: string[] = [];
const say = (s = "") => { lines.push(s); console.log(s); };

say(`Forward exit study. ${trades.length} trades on the public book, ${rows.length} filled and closed (${rows.filter((r) => r.reason === "sl").length} stopped, ${rows.filter((r) => r.reason === "tp").length} at target).`);
say("Rules locked before this run: stop is checked before target; a trigger on a candle that also hits the stop does not arm; the fill candle can stop the trade and cannot arm a trigger; breakeven is the entry price, so fees still make it a small loss.");
say("A row under 30 closed trades is too early.");

const sl = rows.filter((r) => r.reason === "sl");
const audits = sl.map((r) => {
  const recomputed = pageMfe(r.leg, r.candles, r.exitT);
  const withFill = mfeIncludingFill(r.leg, r.candles, r.exitT);
  const path = pathMfe(r.leg, r.candles, r.exitT);
  const audit = targetAudit(r.leg, r.candles, r.exitT);
  const cur = play(r, "current", "stopFirst");
  return { r, recomputed, withFill, path, audit, cur };
});
const mfeGap = audits.filter((a) => a.r.storedMfe != null && a.recomputed != null && Math.abs(a.r.storedMfe - a.recomputed) > 0.05);
const fillBug = audits.filter((a) => a.r.storedMfe != null && a.recomputed != null && Math.abs(a.r.storedMfe - a.withFill) + 0.02 < Math.abs(a.r.storedMfe - a.recomputed) && a.withFill > a.recomputed + 0.05);
const missedTarget = rows.filter((r) => targetAudit(r.leg, r.candles, r.exitT).missedTarget);
const missedStop = rows.filter((r) => targetAudit(r.leg, r.candles, r.exitT).missedStop);
const sameCandle = rows.filter((r) => targetAudit(r.leg, r.candles, r.exitT).sameCandle);
const fillStops = audits.filter((a) => a.cur.reason === "sl" && a.cur.exitT === a.r.leg.fillT);
const replayGap = rows.filter((r) => { const a = play(r, "current", "stopFirst"); return a.r != null && r.storedExCost != null && Math.abs(a.r - r.storedExCost) > 0.05; });
const missing = rows.filter((r) => play(r, "current", "stopFirst").missing);

say("");
say("Best-number check");
say(`  ${sl.length} stopped trades. ${mfeGap.length} have a displayed best more than 0.05R away from a fresh reading of the same rule.`);
say(`  ${fillBug.length} displayed bests sit closer to a reading that includes the fill candle. That candle is skipped on purpose, because its wick may be from before the fill.`);
say(`  ${fillStops.length} stops happened on the fill candle itself.`);
say(`  ${missedTarget.length} closed trades traded through the target on an earlier candle that did not hit the stop.`);
say(`  ${missedStop.length} closed trades hit the stop on an earlier candle than the recorded exit.`);
say(`  ${sameCandle.length} closed trades had the stop and the target in the exit candle. The book counts those as stops.`);
say(`  ${missing.length} replays are missing the fill candle. ${replayGap.length} current replays differ from stored R (ex-funding) by more than 0.05R.`);
const show = (xs: Row[], label: string) => { if (xs.length) say(`  ${label}: ${xs.slice(0, 12).map((r) => r.id).join(", ")}${xs.length > 12 ? ` … +${xs.length - 12}` : ""}`); };
show(mfeGap.map((a) => a.r), "best mismatch");
show(fillBug.map((a) => a.r), "fill-candle best");
show(missedTarget, "missed target");
show(missedStop, "missed stop");
show(replayGap, "replay gap");

say("");
say("Stopped trades: how far price went our way before the stop");
const dist = (name: string, xs: typeof audits) => {
  const n = xs.length; const mfe = xs.map((a) => a.path.mfe); const bars = xs.map((a) => a.path.barsToMfe).filter((x): x is number => x != null);
  const hit = (lv: number) => xs.filter((a) => a.path.mfe >= lv - 1e-9).length;
  say(`  ${name.padEnd(28)} ${cell(String(n), 4)}  med ${cell(rr(median(mfe)), 6)}  med bars ${cell(median(bars) == null ? "–" : median(bars)!.toFixed(0), 3)}  ${MFE(hit)} ${n < 30 ? " too early" : ""}`);
};
const MFE = (hit: (lv: number) => number) => ["0.5", "1", "1.5", "2"].map((lv, i) => `≥${lv} ${String(hit([0.5, 1, 1.5, 2][i])).padStart(3)}`).join("  ");
say(`  ${"Group".padEnd(28)} ${cell("n", 4)}  ${"median".padStart(6)}  ${"bars".padStart(8)}  reached before the stop`);
dist("All stopped", audits);
for (const tf of ["15m", "1h", "4h"]) dist(tf, audits.filter((a) => a.r.tf === tf));
for (const b of BOOKS) dist(b.name, audits.filter((a) => a.r.book === b.name));
for (const s of ["Strong", "OK", "Weak", "Unknown"] as const) dist(`Strength ${s}`, audits.filter((a) => a.r.strength === s));
for (const c of ["Low", "Med", "High", "Unknown"] as const) dist(`Confidence ${c}`, audits.filter((a) => a.r.conf === c));

say("");
say("Replay of every filled closed trade. Stop-first is the headline. The last column is the other reading, where a same-candle favorable wick happens first.");
say(`  ${"Variant".padEnd(52)} ${cell("n", 4)} ${cell("open", 5)} ${cell("ambig", 5)} ${cell("win", 5)} ${cell("total", 8)} ${cell("avg", 7)} ${cell("maxDD", 7)} ${cell("if wick first", 12)}`);
const closedOf = (v: Variant, mode: Mode) => rows.map((r) => ({ row: r, x: play(r, v, mode) })).filter((z) => z.x.r != null && z.x.exitT != null);
for (const v of VARIANTS) {
  const prim = closedOf(v, "stopFirst"); const rosy = closedOf(v, "favorableFirst");
  const s = score(prim.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! })));
  const o = score(rosy.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! })));
  const open = rows.length - prim.length; const amb = prim.filter((z) => z.x.ambiguous).length;
  const gave = prim.filter((z) => play(z.row, "current", "stopFirst").reason === "tp" && z.x.reason !== "tp").length;
  say(`  ${NAMES[v].padEnd(52)} ${cell(String(s.n), 4)} ${cell(String(open), 5)} ${cell(String(amb), 5)} ${cell(pct(s.winRate), 5)} ${cell(rr(s.totalR), 8)} ${cell(rr(s.avgR), 7)} ${cell(rr(s.maxDdR), 7)} ${cell(rr(o.totalR), 12)}${s.early ? "  too early" : ""}${gave ? `  gave back ${gave} targets` : ""}`);
}

say("");
say("Stop-first total R by timeframe. A cell under 30 trades is marked.");
say(`  ${"Variant".padEnd(52)} ${["15m", "1h", "4h"].map((tf) => tf.padStart(16)).join("")}`);
for (const v of VARIANTS) {
  const bits = ["15m", "1h", "4h"].map((tf) => {
    const xs = closedOf(v, "stopFirst").filter((z) => z.row.tf === tf);
    const s = score(xs.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! })));
    return `${rr(s.totalR)} n=${s.n}${s.early ? "*" : ""}`.padStart(16);
  });
  say(`  ${NAMES[v].padEnd(52)} ${bits.join("")}`);
}
say("  * under 30 trades");
const reached = audits.filter((a) => a.path.mfe >= 0.5 - 1e-9 && a.path.barsToMfe != null && a.r.exitT != null);
const after = reached.map((a) => (a.r.exitT! - a.r.leg.fillT) / a.r.leg.barMs - a.path.barsToMfe!);
say("");
say(`Of ${reached.length} stops that reached +0.5R, the best print was a median ${rr(median(reached.map((a) => a.path.barsToMfe!)), 0)} bars after the fill, and the stop came a median ${rr(median(after), 0)} bars after that best print.`);
say("");
say("Stop-first total R by zone strength. Unknown is the one legacy trade the placement replay could not match.");
say(`  ${"Variant".padEnd(52)} ${["Strong", "OK", "Weak"].map((s) => s.padStart(18)).join("")}`);
for (const v of ["current", "be10", "partial1", "trail1", "time8"] as const) {
  const bits = (["Strong", "OK", "Weak"] as const).map((s) => {
    const xs = closedOf(v, "stopFirst").filter((z) => z.row.strength === s);
    const sc = score(xs.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! })));
    return `${rr(sc.totalR)} n=${sc.n}${sc.early ? "*" : ""}`.padStart(18);
  });
  say(`  ${NAMES[v].padEnd(52)} ${bits.join("")}`);
}

say("");
say("15m only, stop-first, by strength. This is the slice large enough to read.");
for (const v of ["current", "trail1", "time8"] as const) {
  const bits = (["Strong", "OK", "Weak"] as const).map((s) => {
    const xs = closedOf(v, "stopFirst").filter((z) => z.row.tf === "15m" && z.row.strength === s);
    const sc = score(xs.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! })));
    return `${s} ${rr(sc.totalR)} n=${sc.n}${sc.early ? "*" : ""}`;
  });
  say(`  ${NAMES[v].padEnd(52)} ${bits.join("   ")}`);
}

const cur = closedOf("current", "stopFirst");
const curR = score(cur.map((z) => ({ r: z.x.r!, exitT: z.x.exitT! }))).totalR;
say("");
say(`Current replay total ${rr(curR)}R on ${cur.length} trades. Stored results ex-funding differ by more than 0.05R on ${replayGap.length} trades.`);
say(`Strength was matched at placement for ${rows.filter((r) => r.strength !== "Unknown").length} of ${rows.length} closed trades. The rest stay Unknown.`);

await import("node:fs").then((fs) => fs.writeFileSync("/tmp/exit-study.txt", lines.join("\n") + "\n"));
