// Run the forward test once (GitHub Actions, hourly). Needs DATABASE_URL. Read-only market data; no trading.
import { neon } from "@neondatabase/serverless";
import { runJob } from "../src/forward/job";
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set: add it as a GitHub Actions secret."); process.exit(1); }
const sql = neon(url);
const r = await runJob((text, params) => sql.query(text, params as any[]) as Promise<any[]>);
console.log(`done: +${r.inserted} snapshots, ${r.resolved} status changes, ${r.errors.length} errors`);
if (r.errors.length && r.inserted === 0 && r.resolved === 0 && r.errors.length >= 12) process.exit(1);
