import { useEffect, useMemo, useRef, useState } from "react";
import { LATEST, VERSIONS, VERSION_LABEL } from "../forward/version.js";
import { nextRunLabel, progress, SMALL_N } from "../forward/view.js";
import { topOfBook } from "../api/markets";
import { fmt } from "../engine/scan";
import { useVisibleInterval } from "./useVisibleInterval";

type Score = { n: number; waiting: number; running: number; win: number; loss: number; expired: number; resolved: number; filled: number; winRate: number | null; avgR: number | null; expiredPct: number | null; small: boolean };
type Z = { zone: number; entry_bottom: number; entry_top: number; sl: number; tp1: number; tp2: number; rr: number; status: string; outcome: string; rNet: number | null; bars: number | null };
type SetupCard = { venue: string; symbol: string; tf: string; side: "long" | "short"; candle_t: number; close_t: number; version: string; conf_band: string; conf_pct: number; px: number | null; atr: number | null; zones: Z[] };
type Data = { configured: boolean; error?: string; lastRun?: { at: string } | null; versions?: { version: string; n: number }[]; hidden?: number; total?: number; score?: Score; by?: Record<string, ({ key: string } & Score)[]>; setups?: SetupCard[]; facets?: { venue: string[]; symbol: string[]; tf: string[] } };
const VN: Record<string, string> = { hyperliquid: "Hyperliquid", bulk: "Bulk" };
const OUT: Record<string, string> = { waiting: "waiting to fill", running: "filled, running", win: "TP1 hit", loss: "stopped", expired: "not filled (expired)" };
const wib = (t: number | string) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " WIB";
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Never a bare % on a small sample: "3 of 7 · small sample". */
export function rateText(k: number, n: number) { if (!n) return "–"; return n < SMALL_N ? `${k} of ${n} · small sample` : `${pct(k / n)} (${k}/${n})`; }
const rText = (s: Score) => (s.avgR == null ? "–" : `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}R${s.small ? ` · n=${s.resolved}, small sample` : ""}`);
const F_KEYS = ["venue", "symbol", "tf", "side", "zone", "status", "from", "to"] as const;
type Filters = Partial<Record<(typeof F_KEYS)[number], string>>;
const qs = (v: string, f: Filters) => new URLSearchParams({ v, ...Object.fromEntries(Object.entries(f).filter(([, x]) => x)) }).toString();

function Board({ s }: { s: Score }) {
  const items: [string, string][] = [["Resolved", String(s.resolved)], ["Waiting to fill", String(s.waiting)], ["Running", String(s.running)], ["Win rate (TP1 vs stop)", rateText(s.win, s.resolved)], ["Average R, after fees", rText(s)], ["Expired / no fill", rateText(s.expired, s.filled + s.expired)]];
  return <div className="statrow">{items.map(([k, v]) => <div key={k} className="card stat"><span className="lbl">{k}</span><b className="mono">{v}</b></div>)}</div>;
}
function Breakdown({ name, rows }: { name: string; rows: ({ key: string } & Score)[] }) {
  if (!rows?.length) return null;
  return <div className="card"><h3>By {name}</h3><table className="rt"><thead><tr><th>{name}</th><th>Setups</th><th>Resolved</th><th>Win rate</th><th>Avg R</th><th>Expired</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.key}><td data-label={name}><b>{VN[r.key] ?? (name === "timeframe" ? r.key.toUpperCase() : r.key)}</b>{r.small && <span className="badge" title={`Only ${r.resolved} resolved`}>small sample</span>}</td>
      <td data-label="Setups" className="num">{r.n}</td><td data-label="Resolved" className="num">{r.resolved}</td><td data-label="Win rate" className="num">{rateText(r.win, r.resolved)}</td>
      <td data-label="Avg R" className="num">{r.avgR == null ? "–" : r.avgR.toFixed(2)}</td><td data-label="Expired" className="num">{rateText(r.expired, r.filled + r.expired)}</td></tr>)}</tbody></table></div>;
}
function Card({ s, px, prevPx, now }: { s: SetupCard; px?: number; prevPx?: number; now: number }) {
  return <article className="card fsetup">
    <div className="cardhead"><h3>{VN[s.venue]} {s.symbol} · {s.tf.toUpperCase()} <span className={`badge ${s.side}`}>{s.side}</span></h3><span className="lbl">{wib(s.close_t)} · {s.conf_band} {s.conf_pct}% · {s.version}</span></div>
    <div className="fzones">{s.zones.map((z) => { const p = z.outcome === "waiting" && px ? progress(z, s, px, now, s.px ?? prevPx, z.bars ?? 0) : null;
      return <div key={z.zone} className={`fzone ${z.outcome}`}>
        <div className="row between"><b>Z{z.zone}</b><span className={`badge ${z.outcome === "win" ? "long" : z.outcome === "loss" ? "short" : ""}`}>{OUT[z.outcome]}</span></div>
        <dl className="kv"><span>Entry</span><b>{fmt(z.entry_bottom)}–{fmt(z.entry_top)}</b><span>Stop</span><b className="neg">{fmt(z.sl)}</b><span>TP1 / TP2</span><b className="pos">{fmt(z.tp1)} / {fmt(z.tp2)}</b>
          <span>R:R</span><b>{z.rr.toFixed(1)}R{z.rNet != null ? ` · result ${z.rNet >= 0 ? "+" : ""}${z.rNet.toFixed(2)}R` : ""}</b></dl>
        {p && <p className="small mono">{p.inside ? `Price in zone now · fill confirms at next run (${nextRunLabel(now)})` : `${(p.gapPct * 100).toFixed(2)}% away${p.gapAtr != null ? ` (${p.gapAtr.toFixed(1)} ATR)` : ""}${p.trend ? ` · ${p.trend}` : ""} · ${p.barsLeft} bars left`}</p>}
      </div>; })}</div>
  </article>;
}
export function ForwardView() {
  const [ver, setVer] = useState<string>(LATEST); const [f, setF] = useState<Filters>({}); const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState("");
  useEffect(() => { let live = true; setErr(""); fetch(`/api/forward?${qs(ver, f)}`).then((r) => r.json()).then((x) => live && setD(x)).catch(() => live && setErr("Couldn't load the forward test right now.")); return () => { live = false; }; }, [ver, f]);
  // live prices for setups still waiting to fill: Hyperliquid mids in one call, Bulk book mids for up to 8 symbols
  const [px, setPx] = useState<Record<string, number>>({}); const prev = useRef<Record<string, number>>({}); const [now, setNow] = useState(Date.now());
  const waiting = useMemo(() => (d?.setups ?? []).filter((s) => s.zones.some((z) => z.outcome === "waiting")), [d]);
  const poll = async () => { if (!waiting.length) return; const out: Record<string, number> = {};
    if (waiting.some((s) => s.venue === "hyperliquid")) try { const m = await (await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }) })).json(); for (const s of waiting) if (s.venue === "hyperliquid" && m[s.symbol]) out[`hyperliquid|${s.symbol}`] = +m[s.symbol]; } catch { /* offline */ }
    for (const sym of [...new Set(waiting.filter((s) => s.venue === "bulk").map((s) => s.symbol))].slice(0, 8)) try { const b = await topOfBook("bulk", sym); out[`bulk|${sym}`] = (b.bid + b.ask) / 2; } catch { /* skip */ }
    setPx((p) => { prev.current = p; return { ...p, ...out }; }); setNow(Date.now()); };
  useEffect(() => { poll(); }, [waiting]);
  useVisibleInterval(() => { poll(); }, 15_000, [waiting]);
  if (err) return <section className="card"><p className="alert">{err}</p></section>;
  if (!d) return <section className="card"><p className="dim" role="status">Loading…</p></section>;
  if (!d.configured || d.error) return <section className="card stack"><h2>Forward test</h2><p className="dim">{d.error ?? "The forward test is being set up. Results will appear here after the first hourly run."}</p></section>;
  const s = d.score!; const set = (k: keyof Filters, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));
  const sel = (k: keyof Filters, label: string, opts: [string, string][]) => <label className="fsel"><span className="lbl">{label}</span><select className="input" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">All</option>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  const fc = d.facets ?? { venue: [], symbol: [], tf: [] };
  return (
    <section className="stack rise forward">
      <div className="card stack">
        <div className="cardhead"><h2>Forward test</h2><span className="row gap"><span className="badge">live · still growing</span><a className="btn sm" href={`/api/forward?format=csv&${qs(ver, f)}`} download>Export CSV</a></span></div>
        <p className="small">Every hour, Signal scans every Bulk market that is trading (and the same coin on Hyperliquid) on 15m, 1H, 4H and 1D. When the default strategy finds a setup, it saves all 3 zones once and never edits them, then watches what price does next.</p>
        <p className="dim small"><b>Win</b> = TP1 reached after filling (all-in on TP1). <b>Loss</b> = stop first (a stop and a target in the same candle counts as a stop). <b>Expired</b> = price never reached the zone within 24 candles. Average R is after taker fees on both sides. Only finished candles are used. Real, unseen data, but young: small numbers swing a lot. Not financial advice.</p>
        <div className="row gap wrap"><label className="lbl" htmlFor="fwd-ver">Rules version</label>
          <select id="fwd-ver" className="input" value={ver} onChange={(e) => setVer(e.target.value)}>{[...VERSIONS, "all"].map((v) => { const n = v === "all" ? d.versions?.reduce((a, x) => a + x.n, 0) : d.versions?.find((x) => x.version === v)?.n; return <option key={v} value={v}>{(VERSION_LABEL as Record<string, string>)[v]} ({n ?? 0})</option>; })}</select>
          {d.lastRun && <span className="dim small">Last update {wib(d.lastRun.at)}.</span>}</div>
        <div className="ffilters">
          {sel("venue", "Venue", fc.venue.map((v) => [v, VN[v] ?? v]))}{sel("symbol", "Coin", fc.symbol.map((v) => [v, v]))}{sel("tf", "Timeframe", fc.tf.map((v) => [v, v.toUpperCase()]))}
          {sel("side", "Side", [["long", "Long"], ["short", "Short"]])}{sel("zone", "Zone", [["1", "Z1"], ["2", "Z2"], ["3", "Z3"]])}{sel("status", "Status", Object.entries(OUT))}
          <label className="fsel"><span className="lbl">From</span><input className="input" type="date" value={f.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
          <label className="fsel"><span className="lbl">To</span><input className="input" type="date" value={f.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
          {Object.values(f).some(Boolean) && <button className="btn ghost sm" onClick={() => setF({})}>Clear filters</button>}
        </div>
        {!!d.hidden && <p className="dim small">{d.hidden} repeated row{d.hidden === 1 ? "" : "s"} (same setup logged again while still open) hidden from stats, cards and CSV. Nothing is deleted.</p>}
      </div>
      {!d.total ? <p className="note">No setups match{ver !== "all" ? ` under ${(VERSION_LABEL as Record<string, string>)[ver]}` : ""} yet. New ones appear after the next hourly run.</p> : <>
        <Board s={s} />
        <div className="fbreak">{([["zone", "zone"], ["tf", "timeframe"], ["venue", "venue"], ["side", "side"], ["symbol", "coin"]] as const).map(([k, n]) => <Breakdown key={k} name={n} rows={d.by?.[k] ?? []} />)}</div>
        <h3>Latest setups <span className="dim small">({Math.min(40, d.setups?.length ?? 0)} newest)</span></h3>
        <div className="fcards">{d.setups!.map((x) => <Card key={`${x.venue}|${x.symbol}|${x.tf}|${x.side}|${x.candle_t}`} s={x} px={px[`${x.venue}|${x.symbol}`]} prevPx={prev.current[`${x.venue}|${x.symbol}`]} now={now} />)}</div>
      </>}
    </section>
  );
}
