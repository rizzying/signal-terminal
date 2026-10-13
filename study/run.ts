import { Worker } from "node:worker_threads"; import fs from "node:fs";
import { simulate, stats, type BarSig } from "../src/engine/sim";
import { BUILTINS } from "../src/strategies";
const ASSETS = ["BTC", "ETH", "SOL"], TFS = ["1h", "4h", "1d"]; const MS: any = { "1h": 3.6e6, "4h": 1.44e7, "1d": 8.64e7 };
const CACHE = "/workspace/bt-cache"; fs.mkdirSync(CACHE, { recursive: true });
async function hl(coin: string, tf: string) { const f = `${CACHE}/${coin}-${tf}.json`; if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: tf, startTime: Date.now() - 5000 * MS[tf] } }) });
  const c = (await r.json()).map((k: any) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v })); c.pop(); fs.writeFileSync(f, JSON.stringify(c)); return c; }
const pool = 7; let active = 0; const q: (() => void)[] = []; const slot = () => new Promise<void>((ok) => (active < pool ? (active++, ok()) : q.push(() => (active++, ok())))); const free = () => { active--; q.shift()?.(); };
async function sigs(candles: any[], sid: string, key: string): Promise<BarSig[]> { const f = `${CACHE}/sig-${key}.json`; if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  await slot(); try { const r: BarSig[] = await new Promise((ok, bad) => { const w = new Worker(new URL("./signals.mjs", import.meta.url), { workerData: { candles, sid } }); w.on("message", ok); w.on("error", bad); });
    fs.writeFileSync(f, JSON.stringify(r)); console.error("done", key); return r; } finally { free(); } }
const DS: { a: string; tf: string; c: any[]; split: number }[] = [];
for (const a of ASSETS) for (const tf of TFS) { const c = await hl(a, tf); DS.push({ a, tf, c, split: 300 + Math.floor((c.length - 300) * 0.6) }); }
const SIG: Record<string, BarSig[]> = {};
await Promise.all(DS.flatMap((d) => BUILTINS.map(async (b) => { SIG[`${d.a}-${d.tf}-${b.id}`] = await sigs(d.c, b.id, `${d.a}-${d.tf}-${b.id}`); })));
const EXITS = [{ n: "TP 1.5R", tpR: 1.5, exit: 0 }, { n: "TP 2R", tpR: 2, exit: 0 }, { n: "TP 3R", tpR: 3, exit: 0 }, { n: "½@2R, rest 3R", tpR: 2, exit: 1 }, { n: "½@2R, rest BE", tpR: 2, exit: 2 }] as const;
const COST = (2 * 0.045 + 0.01) / 100; // HL taker both sides + ~1bp spread
const rows: any[] = [];
for (const b of BUILTINS) for (const zone of [0, 1, 2] as const) for (const k of [0.5, 1, 1.5, 2]) for (const ex of EXITS) for (const onClose of [true, false]) {
  const per = DS.map((d) => { const sg = SIG[`${d.a}-${d.tf}-${b.id}`]; const o = { zone, k, tpR: ex.tpR, exit: ex.exit as 0 | 1 | 2, onClose, costFrac: COST };
    return { a: d.a, tf: d.tf, is: simulate(d.c, sg, { ...o, from: 300, to: d.split }), oos: simulate(d.c, sg, { ...o, from: d.split, to: d.c.length }) }; });
  const S = (k: "is" | "oos") => { const all = per.flatMap((p) => p[k]); const each = per.map((p) => stats(p[k])); const ok = each.filter((e) => e.n >= 5);
    const med = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
    return { ...stats(all), med: med(ok.map((e) => e.exp)), pos: ok.filter((e) => e.exp > 0).length, cnt: ok.length, maxDD: Math.max(...each.map((e) => e.ddR)), each }; };
  rows.push({ strat: b.name, sid: b.id, zone: zone + 1, k, exit: ex.n, tpR: ex.tpR, exitMode: ex.exit, entry: onClose ? "close in zone" : "touch", is: S("is"), oos: S("oos") });
}
fs.writeFileSync(`${CACHE}/grid.json`, JSON.stringify(rows));
console.log("rows", rows.length, "datasets", DS.map((d) => `${d.a}-${d.tf}:${d.c.length} ${new Date(d.c[300].t).toISOString().slice(0, 10)}|${new Date(d.c[d.split].t).toISOString().slice(0, 10)}|${new Date(d.c.at(-1).t).toISOString().slice(0, 10)}`).join(" "));
