// Run the forward test once (GitHub Actions, hourly). Needs DATABASE_URL. Read-only market data; no trading.
import { neon } from "@neondatabase/serverless";
import { runJob } from "../src/forward/job";
const url = process.env.DATABASE_URL;
if (!url) { console.log("::warning::DATABASE_URL secret is not set yet; skipping the forward test run."); process.exit(0); }
const sql = neon(url);
const r = await runJob((text, params) => sql.query(text, params as any[]) as Promise<any[]>);
console.log(`done: +${r.inserted} snapshots, ${r.resolved} status changes, ${r.errors.length} errors`);
if (r.errors.length && r.inserted === 0 && r.resolved === 0 && r.errors.length >= 12) process.exit(1);
