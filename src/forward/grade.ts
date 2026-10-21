// Placement grade per paper trade, written once to fwd_grades after the hourly run for the report split.
// The only writer of fwd_grades. Nothing in the trader, the recorder or the verdict reads it.
import type { Candle } from "../engine/indicators";
import { scan } from "../engine/scan";
import type { ZoneGrade } from "../engine/zoneStrength";
import { roundTick } from "../api/markets";
import { plansByZone, SPEC, TICK, BOOK_HASH, LEGACY_HASH, LEGACY_STRATEGY, type Side } from "./trader";
import { bookOf, reportBooks, TF_MS, TF_INTERVAL } from "./books.js";
import type { Q } from "./db";

export type Reason = "rules" | "moved" | "no-conf" | "candles" | "no-setup" | "mismatch";
export type Grade = { verdict: "ok"; strength: ZoneGrade } | { verdict: Reason; facts: Record<string, unknown> };
export type GradeRow = { key: string } & Grade;
/** The fwd_trades fields a grade reads, parsed once at the boundary. */
export type Placed = { key: string; strategy: string; rulesHash: string; market: string; side: Side; placedT: number; entry: number; sl: number; tp: number; conf: number | null; replaced: number };
/** Binance spot candles of one interval whose open time is in [from, to], oldest first. */
export type RangeFetch = (market: string, interval: string, from: number, to: number, signal?: AbortSignal) => Promise<Candle[]>;
export const GRADE_BUDGET_MS = 90_000;
export const GRADE_SCHEMA: string[] = [
  `create table if not exists fwd_grades (key text primary key references fwd_trades(key), verdict text not null, strength text, facts jsonb,
    graded_at timestamptz not null default now(), check ((verdict = 'ok') = (strength is not null)))`,
];

export function parsePlaced(r: Record<string, any>): Placed {
  return { key: r.key, strategy: r.strategy, rulesHash: r.rules_hash, market: r.market, side: r.side, placedT: Number(r.placed_t),
    entry: Number(r.entry), sl: Number(r.sl), tp: Number(r.tp), conf: r.conf == null ? null : Number(r.conf), replaced: Number(r.replaced) };
}
type Field = "entry" | "sl" | "tp" | "conf";
const mismatch = (fields: Field[], replay: Partial<Record<Field, number | null>>, t: Placed): Grade =>
  ({ verdict: "mismatch", facts: { fields, replay: Object.fromEntries(fields.map((f) => [f, replay[f]])), stored: Object.fromEntries(fields.map((f) => [f, t[f]])) } });

/** The gate, first failure wins. ok only when the trader's own plan builder reproduces every stored number exactly. */
export function gradeTrade(t: Placed, closed: Candle[]): Grade {
  const book = bookOf(t.strategy)!; const bar = TF_MS[book.tf];
  const want = t.strategy === LEGACY_STRATEGY ? LEGACY_HASH : BOOK_HASH[t.strategy];
  if (t.rulesHash !== want) return { verdict: "rules", facts: { hash: t.rulesHash, want } };
  if (t.replaced !== 0) return { verdict: "moved", facts: { replaced: t.replaced } };
  if (t.conf == null) return { verdict: "no-conf", facts: {} };
  const last = t.placedT - bar; const win = closed.filter((k) => k.t <= last).slice(-SPEC.window);
  if (win.length !== SPEC.window || win.at(-1)!.t !== last) return { verdict: "candles", facts: { got: win.filter((k) => k.t > last - SPEC.window * bar).length } };
  const plan = plansByZone(win, t.market, [book.zone])[book.zone]?.find((p) => p.side === t.side);
  if (!plan) return { verdict: "no-setup", facts: { side: t.side, zone: book.zone } };
  const off = (["entry", "sl", "tp", "conf"] as const).filter((f) => plan[f] !== t[f]);
  if (off.length) return mismatch(off, plan, t);
  const z = scan(win, t.side, SPEC.settings, { costs: { spread: 0, feePct: SPEC.costs.zoneFeePct } }).zones.find((x) => x.rank === book.zone);
  const tick = TICK[t.market]; const L = t.side === "long";
  const scanned: Record<"entry" | "sl" | "tp", number | null> = z ? { entry: roundTick(z.entry, tick), sl: roundTick(z.stop, tick, L ? "down" : "up"), tp: roundTick(z.t1, tick) } : { entry: null, sl: null, tp: null };
  const drift = (["entry", "sl", "tp"] as const).filter((f) => scanned[f] !== plan[f]);
  if (!z || drift.length) return mismatch(drift, scanned, t);
  return { verdict: "ok", strength: z.strength };
}

export const rangeKlines: RangeFetch = async (m, interval, from, to, signal) => {
  const by = new Map<number, Candle>();
  for (let start = from; start <= to; ) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${m}&interval=${interval}&startTime=${start}&endTime=${to}&limit=1000`, { signal });
    if (!r.ok) throw new Error(`klines ${r.status}`);
    const page: any[] = await r.json();
    for (const k of page) by.set(k[0], { t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });
    if (page.length < 1000) break;
    start = page.at(-1)[0] + 1;
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
};

/** One ranged fetch per market × timeframe. A fetch error grades nothing in that group, so the next run retries it. */
export async function gradeRows(rows: Placed[], klines: RangeFetch = rangeKlines, signal?: AbortSignal): Promise<{ grades: GradeRow[]; errors: string[] }> {
  const groups = new Map<string, Placed[]>();
  for (const r of rows) { const k = `${r.market}|${bookOf(r.strategy)!.tf}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const grades: GradeRow[] = []; const errors: string[] = [];
  await Promise.all([...groups].map(async ([k, rs]) => {
    const [m, tf] = k.split("|"); const bar = TF_MS[tf]; const ts = rs.map((r) => r.placedT);
    let closed: Candle[];
    try { closed = await klines(m, TF_INTERVAL[tf], Math.min(...ts) - (SPEC.window + 1) * bar, Math.max(...ts) - bar, signal); }
    catch (e: any) { errors.push(`${m} ${tf}: ${String(e?.message ?? e).slice(0, 200)}`); return; }
    for (const r of rs) grades.push({ key: r.key, ...gradeTrade(r, closed) });
  }));
  return { grades, errors };
}

/** Grades every report-book trade that has no row yet. Idempotent: a second run inserts nothing. */
export async function gradeJob(q: Q, o: { klines?: RangeFetch; budgetMs?: number } = {}): Promise<{ graded: number; unknown: number; errors: string[] }> {
  const ms = o.budgetMs ?? GRADE_BUDGET_MS; const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`grading ran past its ${ms / 1000}s budget`)), ms);
  try {
    for (const s of GRADE_SCHEMA) await q(s);
    const ids = reportBooks().map((b) => b.id);
    const todo = await q(`select t.* from fwd_trades t left join fwd_grades g using (key) where g.key is null and t.strategy in (${ids.map((_, i) => `$${i + 1}`).join(",")})`, ids);
    const { grades, errors } = await gradeRows(todo.map(parsePlaced), o.klines ?? rangeKlines, ac.signal);
    const ins = grades.length ? await q(`insert into fwd_grades (key, verdict, strength, facts) values ${grades.map((_, i) => `($${4 * i + 1},$${4 * i + 2},$${4 * i + 3},$${4 * i + 4}::jsonb)`).join(",")} on conflict (key) do nothing returning verdict`,
      grades.flatMap((g) => (g.verdict === "ok" ? [g.key, g.verdict, g.strength, null] : [g.key, g.verdict, null, JSON.stringify(g.facts)]))) : [];
    return { graded: ins.length, unknown: ins.filter((r) => r.verdict !== "ok").length, errors };
  } finally { clearTimeout(timer); }
}
