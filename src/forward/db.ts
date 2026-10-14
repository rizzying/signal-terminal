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
