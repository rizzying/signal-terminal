import { useEffect, useState } from "react";
import { LATEST, VERSIONS, VERSION_LABEL } from "../forward/version.js";
import { by, DIM_LABEL, rates, SMALL, type Dim, type Rates, type Row } from "../forward/stats";
type Data = { configured: boolean; error?: string; lastRun?: { at: string; inserted: number; resolved: number } | null; groups?: Row[]; recent?: any[]; span?: { venue: string; first: number; candles: number }[]; versions?: { version: string; n: number }[] };
type View = "all" | "hyperliquid" | "bulk" | "compare";
const VN: Record<string, string> = { hyperliquid: "Hyperliquid", bulk: "Bulk" };
const p = (x: number | null) => (x == null ? "–" : `${Math.round(x)}%`);
const ST: Record<string, string> = { pending: "waiting", expired: "not filled", open: "filled, running", tp1_open: "TP1 hit, running", tp1: "TP1 then stop", tp2: "TP2", sl: "stop" };
const wib = (t: number | string) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " WIB";
function Small({ r, bulk }: { r: Rates; bulk?: boolean }) { return r.withResult < SMALL || bulk ? <span className="badge" title={`Only ${r.withResult} filled trades with a result so far`}>small sample</span> : null; }
function Cells({ r }: { r: Rates }) {
  return <><td data-label="Setups" className="num">{r.n}</td><td data-label="Filled" className="num">{p(r.fillRate)}<small className="dim"> of {r.filled + r.expired}</small></td>
    <td data-label="TP1" className="num pos">{p(r.tp1Rate)}</td><td data-label="TP2" className="num pos">{p(r.tp2Rate)}</td><td data-label="Stop" className="num neg">{p(r.slRate)}</td><td data-label="With result" className="num">{r.withResult}</td></>;
}
function Table({ rows, dim, bulkSmall }: { rows: Row[]; dim: Dim; bulkSmall: boolean }) {
  const g = by(rows, dim); if (!g.length) return null;
  return <div className="card"><h3>By {DIM_LABEL[dim].toLowerCase()}</h3><table className="rt"><thead><tr><th>{DIM_LABEL[dim]}</th><th>Setups</th><th>Filled</th><th>TP1</th><th>TP2</th><th>Stop</th><th>With result</th></tr></thead>
    <tbody>{g.map(({ key, r }) => <tr key={key}><td data-label={DIM_LABEL[dim]}><b>{dim === "zone" ? `Zone ${key}` : dim === "tf" ? key.toUpperCase() : key}</b> <Small r={r} bulk={bulkSmall} /></td><Cells r={r} /></tr>)}</tbody></table></div>;
}
function Compare({ rows, dim }: { rows: Row[]; dim: Dim }) {
  const hl = by(rows.filter((r) => r.venue === "hyperliquid"), dim), bk = by(rows.filter((r) => r.venue === "bulk"), dim);
  const keys = [...new Set([...hl, ...bk].map((x) => x.key))]; if (!keys.length) return null; const f = (xs: typeof hl, k: string) => xs.find((x) => x.key === k)?.r;
  const cell = (r?: Rates) => (r ? `${p(r.tp1Rate)} / ${p(r.slRate)}` : "–");
  return <div className="card"><h3>By {DIM_LABEL[dim].toLowerCase()}: Hyperliquid vs Bulk</h3><p className="dim small">Each cell: TP1 rate / stop rate, then fill rate and trades with a result.</p>
    <table className="rt"><thead><tr><th>{DIM_LABEL[dim]}</th><th>Hyperliquid</th><th>Bulk</th></tr></thead>
    <tbody>{keys.map((k) => { const a = f(hl, k), b = f(bk, k); return <tr key={k}><td data-label={DIM_LABEL[dim]}><b>{dim === "zone" ? `Zone ${k}` : dim === "tf" ? k.toUpperCase() : k}</b></td>
      <td data-label="Hyperliquid" className="num">{cell(a)}<small className="dim"> · fill {p(a?.fillRate ?? null)} · n={a?.withResult ?? 0}</small></td>
      <td data-label="Bulk" className="num">{cell(b)}<small className="dim"> · fill {p(b?.fillRate ?? null)} · n={b?.withResult ?? 0}</small></td></tr>; })}</tbody></table></div>;
}
export function ForwardView() {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(""); const [view, setView] = useState<View>("all"); const [ver, setVer] = useState<string>(LATEST);
  useEffect(() => { setD(null); fetch(`/api/forward?v=${ver}`).then((r) => r.json()).then(setD).catch(() => setErr("Couldn't load the forward test right now.")); }, [ver]);
  if (err) return <section className="card"><p className="alert">{err}</p></section>;
  if (!d) return <section className="card"><p className="dim" role="status">Loading…</p></section>;
  if (!d.configured || d.error) return <section className="card stack"><h2>Forward test</h2><p className="dim">{d.error ?? "The forward test is being set up. Results will appear here after the first hourly run."}</p></section>;
  const all = d.groups ?? []; const rows = view === "all" || view === "compare" ? all : all.filter((r) => r.venue === view);
  const tot = rates(rows); const bulkSmall = view === "bulk" && tot.withResult < 100;
  const bulkSpan = d.span?.find((s) => s.venue === "bulk");
  return (
    <section className="stack rise forward">
      <div className="card stack">
        <div className="cardhead"><h2>Forward test</h2><span className="row gap"><span className="badge">live · still growing</span><a className="btn sm" href={`/api/forward?format=csv&v=${ver}`} download>Export CSV</a></span></div>
        <p className="small">Every hour, Signal checks BTC, ETH and SOL on 1H and 4H, on Hyperliquid and on Bulk. When the default strategy finds a setup, it saves all 3 zones and never changes them. Then it watches what price does next.</p>
        <p className="dim small"><b>Filled</b> = price reached the entry zone within 24 candles. <b>TP1 / TP2 / Stop</b> = what was hit first after filling (if a stop and a target fall in the same candle, it counts as a stop). Only finished candles are used. This is real, unseen data, but it's still young: small numbers can change a lot. Not financial advice.</p>
        {d.lastRun && <p className="dim small">Last update {wib(d.lastRun.at)}.{bulkSpan ? ` Bulk feed since ${wib(Number(bulkSpan.first))}.` : ""}</p>}
        <div className="row gap wrap"><label className="lbl" htmlFor="fwd-ver">Rules version</label>
          <select id="fwd-ver" className="input" value={ver} onChange={(e) => setVer(e.target.value)}>{[...VERSIONS, "all"].map((v) => { const n = v === "all" ? d.versions?.reduce((a, x) => a + x.n, 0) : d.versions?.find((x) => x.version === v)?.n; return <option key={v} value={v}>{(VERSION_LABEL as Record<string, string>)[v]}{n != null ? ` (${n})` : " (0)"}</option>; })}</select>
          <span className="dim small">v1 = original zones · v2 = zones capped at 3.5 ATR (from 14 Oct 09:02 WIB) · v3 = same as v2, each setup logged once until it changes or ends.</span></div>
        {!all.length && <p className="note small">No setups recorded under {(VERSION_LABEL as Record<string, string>)[ver]} yet. They appear after the next hourly run.</p>}
        <div className="seg" role="tablist" aria-label="Venue">{(["all", "hyperliquid", "bulk", "compare"] as View[]).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v === "all" ? "All" : v === "compare" ? "Side by side" : VN[v]}</button>)}</div>
        {view === "bulk" && <p className="note small">Bulk's history is short, so its sample is small. Give it a few weeks before reading much into it.</p>}
      </div>
      {view !== "compare" && <div className="statrow">
        {[["Setups saved", String(tot.n)], ["Filled", p(tot.fillRate)], ["Reached TP1", p(tot.tp1Rate)], ["Reached TP2", p(tot.tp2Rate)], ["Stopped", p(tot.slRate)]].map(([k, v]) => <div key={k} className="card stat"><span className="lbl">{k}</span><b className="mono">{v}</b></div>)}
        <p className="dim small">{tot.withResult} filled trades with a result, {tot.open} still running, {tot.pending} waiting to fill.{tot.withResult < SMALL ? " Small sample: treat these rates as rough." : ""}</p>
      </div>}
      {(["zone", "tf", "symbol", "conf_band"] as Dim[]).map((dim) => (view === "compare" ? <Compare key={dim} rows={all} dim={dim} /> : <Table key={dim} rows={rows} dim={dim} bulkSmall={bulkSmall} />))}
      {!!d.recent?.length && view !== "compare" && <div className="card"><h3>Latest setups</h3><table className="rt"><thead><tr><th>When</th><th>Setup</th><th>Entry</th><th>Status</th></tr></thead>
        <tbody>{d.recent.filter((r) => view === "all" || r.venue === view).map((r, i) => <tr key={i}><td data-label="When">{wib(Number(r.close_t))}</td><td data-label="Setup">{VN[r.venue]} {r.symbol} {r.tf.toUpperCase()} <span className={`badge ${r.side}`}>{r.side}</span> Z{r.zone} · {r.conf_band}</td>
          <td data-label="Entry" className="num">{(+r.entry_bottom).toPrecision(6)}–{(+r.entry_top).toPrecision(6)}</td><td data-label="Status">{ST[r.status] ?? r.status}</td></tr>)}</tbody></table></div>}
    </section>
  );
}
