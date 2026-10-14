// Run the forward test once (GitHub Actions, hourly). Needs DATABASE_URL. Read-only market data; no trading.
// v3.0: the virtual trader (src/forward/paperJob.ts) is the forward test. The old per-candle v4 log no longer gets new rows;
// its remaining open rows are still resolved so they finish honestly (nothing is deleted).
import { neon } from "@neondatabase/serverless";
import { paperJob } from "../src/forward/paperJob";
import { resolveLegacy } from "../src/forward/job";
const url = process.env.DATABASE_URL;
if (!url) { console.log("::warning::DATABASE_URL secret is not set yet; skipping the forward test run."); process.exit(0); }
const sql = neon(url); const q = (text: string, params?: unknown[]) => sql.query(text, params as any[]) as Promise<any[]>;
const tx = async (ss: { text: string; params: unknown[] }[]) => { await sql.transaction(ss.map((x) => sql.query(x.text, x.params as any[]))); };
const p = await paperJob(q, { tx });
const l = await resolveLegacy(q);
await q(`insert into fwd_runs (inserted, resolved, errors, paper) values ($1,$2,$3,$4)`, [0, l.resolved, [...p.errors, ...l.errors].join("; ") || null, JSON.stringify({ events: p.events, closed: p.closed, funding: p.funding })]);
console.log(`done: paper ${p.events} events, ${p.closed} closed (funding: ${p.funding ?? "n/a"}); legacy ${l.resolved} status changes; ${p.errors.length + l.errors.length} errors`);
if (p.errors.length >= 3) process.exit(1);
