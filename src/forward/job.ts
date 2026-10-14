// The forward-test job: snapshot new closed candles (catching up missed ones) and resolve open snapshots. Idempotent.
import { candles as fetchCandles, listMarkets, TF_MS, type TF } from "../api/markets";
import type { Candle } from "../engine/indicators";
import { closedOnly, isRepeat, fwdFeeds, FINAL, FWD_TFS, resolveSnap, snapshotsAt, WINDOW, type Snap, type Venue } from "./core";
import { ensureSchema, type Q } from "./db";
export const MAX_CATCHUP = 72; // candles per feed per run
type Fetch = (v: Venue, sym: string, tf: TF, n: number) => Promise<Candle[]>;
const COLS = ["key", "venue", "symbol", "tf", "candle_t", "close_t", "side", "conf_band", "conf_pct", "others_agree", "others_total", "structure_ok", "signals", "zone", "entry_top", "entry_bottom", "entry_mid", "sl", "tp1", "tp2", "settings_hash", "atr", "rules", "px"] as const;
/** Insert snapshots, skipping repeats: same venue+symbol+TF+side+zone whose latest v3 row is still live (not resolved/expired) and whose levels moved ≤ 0.25 ATR. */
export async function insertSnaps(q: Q, snaps: Snap[]) {
  let n = 0;
  for (const s of snaps) {
    const prev = (await q(`select s.entry_top, s.entry_bottom, s.candle_t, r.status from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id
      where s.venue=$1 and s.symbol=$2 and s.tf=$3 and s.side=$4 and s.zone=$5 and s.rules=$6 and s.candle_t < $7 order by s.candle_t desc, s.id desc limit 1`, [s.venue, s.symbol, s.tf, s.side, s.zone, s.rules, s.candle_t]))[0];
    if (isRepeat(prev && { entry_top: +prev.entry_top, entry_bottom: +prev.entry_bottom, status: prev.status ?? null, candle_t: Number(prev.candle_t) }, s)) continue;
    const r = await q(`insert into fwd_snapshots (${COLS.join(",")}) values (${COLS.map((_, i) => `$${i + 1}`).join(",")}) on conflict (key) do nothing returning id`, COLS.map((c) => (s as any)[c])); n += r.length;
  }
  return n;
}
export async function runJob(q: Q, o: { now?: number; fetch?: Fetch; markets?: (v: Venue) => Promise<{ symbol: string; maxLev: number; tick?: number }[]>; log?: (s: string) => void; concurrency?: number } = {}) {
  const now = o.now ?? Date.now(); const log = o.log ?? console.log; const fetch: Fetch = o.fetch ?? ((v, s, tf, n) => fetchCandles(v, s, tf, n));
  const markets = o.markets ?? ((v: Venue) => listMarkets(v));
  await ensureSchema(q); let inserted = 0, resolved = 0; const errors: string[] = [];
  const mk: Record<Venue, { symbol: string; maxLev: number; tick?: number }[]> = { hyperliquid: [], bulk: [] };
  for (const v of ["bulk", "hyperliquid"] as Venue[]) try { mk[v] = await markets(v); } catch (e: any) { errors.push(`${v} markets: ${e.message}`); }
  const feeds = fwdFeeds(mk.bulk, mk.hyperliquid); log(`${feeds.length} markets × ${FWD_TFS.length} timeframes`);
  // feeds run a few at a time; the shared token buckets keep Bulk under 5 req/s and Hyperliquid within its weight budget
  const work = feeds.flatMap((f) => FWD_TFS.map((tf) => ({ ...f, tf }))); let next = 0;
  const one = async ({ venue: v, symbol: sym, tf }: (typeof work)[number]) => {
      const feed = `${v} ${sym} ${tf}`; const ms = mk[v];
      try {
        const m = ms.find((x) => x.symbol === sym);
        const c = closedOnly(await fetch(v, sym, tf, WINDOW + MAX_CATCHUP + 2), tf, now); if (!c.length) { errors.push(`${feed}: no candles`); return; }
        // 1) resolve everything not final first, so dedupe sees fresh statuses, from closed candles only
        const open = await q(`select s.id, s.candle_t, s.side, s.entry_top, s.entry_bottom, s.sl, s.tp1, s.tp2, r.status from fwd_snapshots s left join fwd_results r on r.snapshot_id = s.id
          where s.venue=$1 and s.symbol=$2 and s.tf=$3 and (r.status is null or not (r.status = any($4)))`, [v, sym, tf, FINAL]);
        let r = 0;
        if (open.length) {
          const from = Math.min(...open.map((x) => Number(x.candle_t))); const need = Math.min(5000, Math.ceil((now - from) / TF_MS[tf]) + 3);
          const after = need <= c.length ? c : closedOnly(await fetch(v, sym, tf, need), tf, now);
          for (const x of open) { const res = resolveSnap({ candle_t: Number(x.candle_t), side: x.side, entry_top: +x.entry_top, entry_bottom: +x.entry_bottom, sl: +x.sl, tp1: +x.tp1, tp2: +x.tp2 }, after);
            if (res.status === x.status && !FINAL.includes(res.status)) { await q(`update fwd_results set bars=$2, updated_at=now() where snapshot_id=$1`, [x.id, res.bars]); continue; }
            await q(`insert into fwd_results (snapshot_id,status,fill_t,tp1_t,done_t,bars) values ($1,$2,$3,$4,$5,$6) on conflict (snapshot_id) do update set status=excluded.status, fill_t=excluded.fill_t, tp1_t=excluded.tp1_t, done_t=excluded.done_t, bars=excluded.bars, updated_at=now()`,
              [x.id, res.status, res.fill_t, res.tp1_t, res.done_t, res.bars]); if (res.status !== x.status) r++; }
        }
        // 2) snapshots for closed candles we haven't processed yet
        const cur = (await q(`select last_t from fwd_cursor where venue=$1 and symbol=$2 and tf=$3`, [v, sym, tf]))[0]?.last_t;
        const last = Number(cur ?? c.at(-1)!.t - 1); // first run: only the latest closed candle
        const todo = c.map((k, i) => i).filter((i) => c[i].t > last).slice(-MAX_CATCHUP);
        let n = 0; for (const i of todo) n += await insertSnaps(q, snapshotsAt(c, i, sym, tf, { venue: v, maxLev: m?.maxLev, tick: m?.tick }));
        await q(`insert into fwd_cursor (venue,symbol,tf,last_t) values ($1,$2,$3,$4) on conflict (venue,symbol,tf) do update set last_t=excluded.last_t`, [v, sym, tf, c.at(-1)!.t]);
        inserted += n;
        resolved += r; log(`${feed}: +${n} snapshots (${todo.length} new candle${todo.length === 1 ? "" : "s"}), ${open.length} open checked, ${r} changed`);
      } catch (e: any) { errors.push(`${feed}: ${String(e.message ?? e).slice(0, 200)}`); }
  };
  await Promise.all(Array.from({ length: o.concurrency ?? 4 }, async () => { while (next < work.length) await one(work[next++]); }));
  await q(`insert into fwd_runs (inserted, resolved, errors) values ($1,$2,$3)`, [inserted, resolved, errors.join("; ") || null]);
  if (errors.length) log("errors: " + errors.join("; "));
  return { inserted, resolved, errors };
}
