// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { isRepeat, RULES, type Snap } from "../src/forward/core";
import { insertSnaps } from "../src/forward/job";
import { ensureSchema } from "../src/forward/db";
import { VERSION_SQL, V2_AT, parseVersion } from "../src/forward/version.js";
const H = 3.6e6;
it("isRepeat: same levels within 0.25 ATR while live; new row on move, resolve, expiry", () => {
  const s = { entry_mid: 100, sl: 95, atr: 4, candle_t: 10 * H, tf: "1h" as const };
  expect(isRepeat(undefined, s)).toBe(false);
  expect(isRepeat({ entry_mid: 100.9, sl: 95.5, status: null, candle_t: 9 * H }, s)).toBe(true);
  expect(isRepeat({ entry_mid: 101.1, sl: 95, status: "pending", candle_t: 9 * H }, s)).toBe(false); // mid moved 1.1 > 1
  expect(isRepeat({ entry_mid: 100, sl: 96.2, status: "open", candle_t: 9 * H }, s)).toBe(false); // stop moved
  expect(isRepeat({ entry_mid: 100, sl: 95, status: "open", candle_t: 9 * H }, s)).toBe(true); // filled, running: still the same trade
  for (const st of ["tp1", "tp2", "sl", "expired"]) expect(isRepeat({ entry_mid: 100, sl: 95, status: st, candle_t: 9 * H }, s)).toBe(false);
  expect(isRepeat({ entry_mid: 100, sl: 95, status: null, candle_t: -20 * H }, s)).toBe(false); // past the 24-bar fill window
  expect(parseVersion("v1")).toBe("v1"); expect(parseVersion("all")).toBe("all"); expect(parseVersion("x; drop")).toBe("v3");
});
it("insertSnaps dedupes per key, is idempotent, labels v3; old rows get v1/v2 from created_at without any UPDATE", async () => {
  const pg = new PGlite(); const q = async (t: string, p?: unknown[]) => (await pg.query(t, p as any[])).rows as any[];
  await ensureSchema(q); await ensureSchema(q); // idempotent migration
  const mk = (t: number, mid: number, zone = 1): Snap => ({ key: `hyperliquid|BTC|1h|${t}|long|${zone}|h`, venue: "hyperliquid", candle_t: t, close_t: t + H, symbol: "BTC", tf: "1h", side: "long", conf_band: "High", conf_pct: 80, others_agree: 4, others_total: 8, structure_ok: true, signals: [], zone, entry_top: mid + 1, entry_bottom: mid - 1, entry_mid: mid, sl: mid - 5, tp1: mid + 10, tp2: mid + 15, settings_hash: "h", atr: 4, rules: RULES });
  expect(await insertSnaps(q, [mk(1 * H, 100), mk(1 * H, 90, 2)])).toBe(2);
  expect(await insertSnaps(q, [mk(2 * H, 100.5), mk(2 * H, 90, 2)])).toBe(0); // same levels → skipped
  expect(await insertSnaps(q, [mk(3 * H, 102)])).toBe(1); // moved 2 > 1 (0.25 × ATR 4)
  const id = (await q("select id from fwd_snapshots where candle_t=$1", [3 * H]))[0].id; await q("insert into fwd_results (snapshot_id,status,bars) values ($1,'sl',3)", [id]);
  expect(await insertSnaps(q, [mk(4 * H, 102)])).toBe(1); // previous resolved → new row
  expect(await insertSnaps(q, [mk(4 * H, 102)])).toBe(0); // rerun: conflict on key, nothing new
  // legacy rows (no rules) → v1 / v2 by created_at
  await q(`insert into fwd_snapshots (key,venue,symbol,tf,candle_t,close_t,side,conf_band,conf_pct,others_agree,others_total,structure_ok,signals,zone,entry_top,entry_bottom,entry_mid,sl,tp1,tp2,settings_hash,created_at)
    values ('old1','hyperliquid','BTC','1h',0,0,'long','Low',10,1,8,true,'{}',1,1,1,1,1,1,1,'h', timestamptz '${V2_AT}' - interval '1 hour'), ('old2','hyperliquid','BTC','1h',0,0,'long','Low',10,1,8,true,'{}',1,1,1,1,1,1,1,'h', timestamptz '${V2_AT}' + interval '1 minute')`);
  const v = await q(`select ${VERSION_SQL} as version, count(*)::int n from fwd_snapshots s group by 1 order by 1`);
  expect(v).toEqual([{ version: "v1", n: 1 }, { version: "v2", n: 1 }, { version: "v3", n: 4 }]);
  await expect(q("update fwd_snapshots set rules='v9'")).rejects.toThrow(/append-only/); // trigger untouched
});
