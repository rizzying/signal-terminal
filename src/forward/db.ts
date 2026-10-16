// Tiny DB layer for the forward test. Works with Neon (serverless HTTP) in production and PGlite in tests.
export type Q = (text: string, params?: unknown[]) => Promise<any[]>;
export const SCHEMA: string[] = [
  `create table if not exists fwd_snapshots (id bigserial primary key, key text unique not null, venue text not null, symbol text not null, tf text not null,
    candle_t bigint not null, close_t bigint not null, side text not null, conf_band text not null, conf_pct int not null, others_agree int not null, others_total int not null,
    structure_ok boolean not null, signals text[] not null, zone int not null, entry_top float8 not null, entry_bottom float8 not null, entry_mid float8 not null,
    sl float8 not null, tp1 float8 not null, tp2 float8 not null, settings_hash text not null, created_at timestamptz not null default now())`,
  `create index if not exists fwd_snapshots_feed on fwd_snapshots (venue, symbol, tf, candle_t)`,
  // append-only: snapshots can never be edited or deleted
  `create or replace function fwd_no_change() returns trigger language plpgsql as $$ begin raise exception 'fwd_snapshots is append-only'; end $$`,
  `drop trigger if exists fwd_snapshots_append_only on fwd_snapshots`,
  `create trigger fwd_snapshots_append_only before update or delete on fwd_snapshots for each row execute function fwd_no_change()`,
  `create table if not exists fwd_results (snapshot_id bigint primary key references fwd_snapshots(id), status text not null, fill_t bigint, tp1_t bigint, done_t bigint, bars int not null, updated_at timestamptz not null default now())`,
  // v2.7.6: rules version + ATR at snapshot time (ADD COLUMN doesn't fire the row trigger; old rows stay null and get their version from created_at)
  `alter table fwd_snapshots add column if not exists rules text`,
  `alter table fwd_snapshots add column if not exists atr float8`,
  `alter table fwd_snapshots add column if not exists px float8`,
  `create index if not exists fwd_snapshots_dedupe on fwd_snapshots (venue, symbol, tf, side, zone, candle_t)`,
  `create table if not exists fwd_cursor (venue text not null, symbol text not null, tf text not null, last_t bigint not null, primary key (venue, symbol, tf))`,
  `create table if not exists fwd_runs (id bigserial primary key, at timestamptz not null default now(), inserted int not null, resolved int not null, errors text)`,
];
export async function ensureSchema(q: Q) { for (const s of SCHEMA) await q(s); }
// v3.0 virtual trader (idempotent; never drops or deletes anything)
export const PAPER_SCHEMA: string[] = [
  `create table if not exists fwd_trades (id bigserial primary key, key text unique not null, strategy text not null, rules_hash text not null, market text not null, side text not null,
    status text not null, placed_t bigint not null, entry float8 not null, sl float8 not null, tp float8 not null, risk float8 not null, conf int, replaced int not null default 0,
    fill_t bigint, exit_t bigint, exit_px float8, exit_reason text, bars int not null default 0, r_gross float8, cost_r float8, funding_r float8, funding_src text, r_net float8,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
  `create index if not exists fwd_trades_live on fwd_trades (strategy, market, status)`,
  `create table if not exists fwd_events (id bigserial primary key, strategy text not null, market text not null, trade_key text references fwd_trades(key), kind text not null, t bigint not null, data jsonb, created_at timestamptz not null default now())`,
  `create unique index if not exists fwd_events_once on fwd_events (strategy, market, kind, t, coalesce(trade_key, ''))`,
  `create table if not exists fwd_trader (strategy text not null, market text not null, last_t bigint not null, primary key (strategy, market))`,
  `alter table fwd_runs add column if not exists paper text`,
  // v3.1.7: running MFE/MAE in R (research only, never used for exits/scoring); max-merged each run so best/worst never shrink
  `alter table fwd_trades add column if not exists mfe_r float8`,
  `alter table fwd_trades add column if not exists mae_r float8`,
  // v3.2.0: tag any pre-version id as the frozen v1 book. Idempotent. Rows already on bn-1h-z2-v1 or a v2 id are not updated.
  `update fwd_trades set strategy = 'bn-1h-z2-v1' where strategy = 'bn-1h-z2'`,
  `update fwd_events set strategy = 'bn-1h-z2-v1' where strategy = 'bn-1h-z2'`,
  `update fwd_trader t set strategy = 'bn-1h-z2-v1' where t.strategy = 'bn-1h-z2' and not exists (select 1 from fwd_trader e where e.strategy = 'bn-1h-z2-v1' and e.market = t.market)`,
];
export async function ensurePaperSchema(q: Q) { await ensureSchema(q); for (const s of PAPER_SCHEMA) await q(s); }
