import { gradeRows, parsePlaced } from "../src/forward/grade";
import { splitBoards, SPLITS } from "../src/forward/split.js";
import { bookOf, TF_MS } from "../src/forward/books.js";

if (process.env.DATABASE_URL) { console.error("DATABASE_URL is set. This proof reads public data only; unset it and rerun."); process.exit(1); }
const base = process.env.URL || "https://signal-terminal-psi.vercel.app";
const get = async (qs = "") => { const r = await fetch(`${base}/api/paper${qs}`); if (!r.ok) throw new Error(`/api/paper${qs}: ${r.status}`); return r.json(); };
const fail = (msg: string) => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const rr = (x: number | null) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`);

const payload = await get();
let trades: any[] = payload.trades;
if (payload.total > trades.length) {
  const by = new Map<string, any>();
  for (const zone of [1, 2, 3]) for (const tf of ["15m", "1h", "4h"]) {
    const p = await get(`?zone=${zone}&tf=${tf}`);
    if (p.total > p.trades.length) throw new Error(`zone ${zone} ${tf}: ${p.total} trades but the page holds ${p.trades.length}`);
    for (const t of p.trades) by.set(t.key, t);
  }
  trades = [...by.values()];
}
const rows = trades.map(parsePlaced);
const { grades, errors } = await gradeRows(rows);
for (const e of errors) fail(`klines ${e}`);
const split = splitBoards(trades, grades);
for (const card of payload.scorecards) {
  const s = split[card.id];
  console.log(`\n${card.name} (${card.id}) · ${card.n} closed · total ${rr(card.score.totalR)}`);
  for (const a of SPLITS) {
    const n = s[a.key].reduce((k: number, x: any) => k + x.n, 0), r = s[a.key].reduce((k: number, x: any) => k + x.totalR, 0);
    if (n !== card.n) fail(`${card.id} ${a.key}: slices hold ${n} closed, card has ${card.n}`);
    if (Math.abs(r - card.score.totalR) > 1e-9) fail(`${card.id} ${a.key}: slices total ${r}R, card has ${card.score.totalR}R`);
    console.log(`  ${a.title.padEnd(14)} ${"Closed".padStart(6)} ${"Win rate".padStart(8)} ${"Avg".padStart(7)} ${"Total".padStart(8)}`);
    for (const x of s[a.key]) console.log(`  ${x.level.padEnd(14)} ${String(x.n).padStart(6)} ${pct(x.winRate).padStart(8)} ${rr(x.avgR).padStart(7)} ${rr(x.n ? x.totalR : null).padStart(8)}${x.early ? "  too early" : ""}`);
  }
  for (const u of s.unknown) console.log(`  ${u.id} ${u.market} ${u.side} ${u.tstatus} ${new Date(u.placed_t).toISOString().slice(0, 16)}Z ${u.reason}: ${u.detail}`);
}

const ok = new Set(grades.filter((g) => g.verdict === "ok").map((g) => g.key));
const reasons = grades.filter((g) => g.verdict !== "ok").reduce((o, g) => ({ ...o, [g.verdict]: (o[g.verdict] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`\n${trades.length} trades, ${grades.length} graded, ${ok.size} reproduced exactly, unknown ${JSON.stringify(reasons)}`);
if (trades.length && !ok.size) fail("no trade reproduced, so the control below proves nothing");
const shifted = await gradeRows(rows.filter((r) => ok.has(r.key)).map((r) => ({ ...r, placedT: r.placedT - TF_MS[bookOf(r.strategy).tf] })));
for (const e of shifted.errors) fail(`control klines ${e}`);
const still = shifted.grades.filter((g) => g.verdict === "ok").length;
console.log(`control: every window one bar earlier, ${still} of ${ok.size} still reproduce`);
if (still > 0.05 * ok.size) fail(`control: ${still} of ${ok.size} still reproduce with every window one bar earlier, so the gate is too loose`);
console.log(process.exitCode ? "\nproof FAILED" : "\nproof passed");
