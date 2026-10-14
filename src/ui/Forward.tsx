import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseTradeId, tradeId } from "../forward/paper.js";
import { TOAST_MS } from "./copySetup";
import { LATEST, VERSIONS, VERSION_LABEL } from "../forward/version.js";
import { nextRunLabel, progress, SMALL_N, FILL_TABS, STATUS5 } from "../forward/view.js";
import { topOfBook } from "../api/markets";
import { fmt } from "../engine/scan";
import { useVisibleInterval } from "./useVisibleInterval";

type Score = { n: number; waiting: number; running: number; win: number; loss: number; expired: number; resolved: number; filled: number; winRate: number | null; avgR: number | null; expiredPct: number | null; small: boolean };
type Z = { zone: number; entry_bottom: number; entry_top: number; sl: number; tp1: number; tp2: number; rr: number; status: string; outcome: string; rNet: number | null; bars: number | null };
type SetupCard = { venue: string; symbol: string; tf: string; side: "long" | "short"; candle_t: number; close_t: number; version: string; conf_band: string; conf_pct: number; px: number | null; atr: number | null; zones: Z[] };
type ZRow = { close_t: number; venue: string; symbol: string; tf: string; side: string; zone: number; entry_bottom: number; entry_top: number; sl: number; tp1: number; fill_t: number | null; fill_px: number | null; status: string; outcome: string; rNet: number | null };
type Data = { configured: boolean; error?: string; lastRun?: { at: string } | null; versions?: { version: string; n: number }[]; hidden?: number; total?: number; score?: Score; by?: Record<string, ({ key: string } & Score)[]>; setups?: SetupCard[]; tabs?: Record<string, number>; zones?: ZRow[]; counts?: Record<string, Record<string, number>>; facets?: { venue: string[]; symbol: string[]; tf: string[] } };
const VN: Record<string, string> = { hyperliquid: "Hyperliquid", bulk: "Bulk" };
const OUT: Record<string, string> = { waiting: "waiting to fill", running: "filled, running", win: "TP1 hit", loss: "stopped", expired: "not filled (expired)" };
const wib = (t: number | string) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " WIB";
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Never a bare % on a small sample: "3 of 7 · small sample". */
export function rateText(k: number, n: number) { if (!n) return "–"; return n < SMALL_N ? `${k} of ${n} · small sample` : `${pct(k / n)} (${k}/${n})`; }
const rText = (s: Score) => (s.avgR == null ? "–" : `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}R${s.small ? ` · n=${s.resolved}, small sample` : ""}`);
const F_KEYS = ["venue", "symbol", "tf", "side", "zone", "status", "from", "to", "fill", "order"] as const;
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
type Group = { key: string; title: string; opts: [string, string][] };
/** Spreadsheet-style header filter: multi-select checkboxes with counts, synced with the filter bar (same state). */
export function HeaderFilter({ label, groups, f, counts, set }: { label: string; groups: Group[]; f: Record<string, string | undefined>; counts?: Record<string, Record<string, number>>; set: (k: any, v: string) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; addEventListener("mousedown", h); return () => removeEventListener("mousedown", h); }, [open]);
  const active = groups.reduce((n, g) => n + (f[g.key] ? f[g.key]!.split(",").length : 0), 0);
  const toggle = (g: Group, v: string) => { const cur = new Set(f[g.key]?.split(",") ?? []); cur.has(v) ? cur.delete(v) : cur.add(v); set(g.key, [...cur].sort().join(",")); };
  return <div className="hfilter" ref={ref}>
    <button className={`btn ghost sm ${active ? "on" : ""}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>{label} ▾{active > 0 && <span className="badge new">{active}</span>}</button>
    {open && <div className="hpop card" role="dialog" aria-label={`Filter ${label}`}>
      {groups.map((g) => <fieldset key={g.key}><legend className="lbl">{g.title}</legend>{g.opts.map(([v, t]) => { const n = counts?.[g.key]?.[v] ?? 0; const on = !!f[g.key]?.split(",").includes(v);
        return <label key={v} className={`hopt ${!n && !on ? "dim" : ""}`}><input type="checkbox" checked={on} onChange={() => toggle(g, v)} /> {t} <span className="mono dim">{n}</span></label>; })}</fieldset>)}
      <div className="row between"><button className="btn ghost sm" disabled={!active} onClick={() => groups.forEach((g) => set(g.key, ""))}>Clear</button><button className="btn sm" onClick={() => setOpen(false)}>Done</button></div>
    </div>}
  </div>;
}
function ZoneTable({ rows, order, onSort, hf }: { rows: ZRow[]; order: string; onSort: () => void; hf: (label: string, groups: Group[]) => React.ReactNode }) {
  const setupG = useSetupGroups(); const zoneG: Group[] = [{ key: "zone", title: "Zone", opts: [["1", "Z1"], ["2", "Z2"], ["3", "Z3"]] }]; const statusG: Group[] = [{ key: "status", title: "Status", opts: Object.entries(STATUS5) as [string, string][] }];
  return <div className="card">
    <div className="zfilters-m row gap wrap"><span className="lbl">Filter</span>{hf("Setup", setupG)}{hf("Zone", zoneG)}{hf("Status", statusG)}</div>
    {!rows.length ? <p className="note">No zones in this view.</p> : <>
    <table className="rt ztable"><thead><tr><th><button className="btn ghost sm" onClick={onSort} aria-label="Sort by time">Logged {order === "asc" ? "↑" : "↓"}</button></th><th>{hf("Setup", setupG)}</th><th>{hf("Zone", zoneG)}</th><th>Entry</th><th>Stop</th><th>TP1</th><th>Fill (WIB) @ price</th><th>{hf("Status", statusG)}</th><th>Result</th></tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}><td data-label="Logged">{wib(r.close_t)}</td><td data-label="Setup">{VN[r.venue]} <b>{r.symbol}</b> {r.tf.toUpperCase()} <span className={`badge ${r.side}`}>{r.side}</span></td><td data-label="Zone">Z{r.zone}</td>
      <td data-label="Entry" className="num">{fmt(r.entry_bottom)}–{fmt(r.entry_top)}</td><td data-label="Stop" className="num neg">{fmt(r.sl)}</td><td data-label="TP1" className="num pos">{fmt(r.tp1)}</td>
      <td data-label="Fill" className="num">{r.fill_t ? <>{wib(r.fill_t)} @ ≈{fmt(r.fill_px!)}</> : "–"}</td><td data-label="Status">{OUT[r.outcome]}</td>
      <td data-label="Result" className={`num ${r.rNet == null ? "" : r.rNet >= 0 ? "pos" : "neg"}`}>{r.rNet == null ? "–" : `${r.rNet >= 0 ? "+" : ""}${r.rNet.toFixed(2)}R`}</td></tr>)}</tbody></table>
    {rows.length >= 300 && <p className="dim small">Showing the 300 {order === "asc" ? "oldest" : "newest"}; narrow the filters or export the CSV for all.</p>}
    <p className="dim small">Fill time is the open of the first closed candle that reached the zone; fill price is estimated as the zone edge it touched.</p></>}</div>;
}
const SetupCtx = { groups: [] as Group[] };
const useSetupGroups = () => SetupCtx.groups;
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
/** The old per-candle log (rules v1–v4), research only: no new rows since v3.0. */
export function SignalLog() {
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
  const sel = (k: keyof Filters, label: string, opts: [string, string][]) => { const multi = f[k]?.includes(",");
    return <label className="fsel"><span className="lbl">{label}</span><select className="input" value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">All</option>{multi && <option value={f[k]} disabled>{f[k]!.split(",").length} selected</option>}{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>; };
  const fc = d.facets ?? { venue: [], symbol: [], tf: [] };
  SetupCtx.groups = [{ key: "venue", title: "Venue", opts: fc.venue.map((v) => [v, VN[v] ?? v]) }, { key: "symbol", title: "Coin", opts: fc.symbol.map((v) => [v, v]) }, { key: "tf", title: "Timeframe", opts: fc.tf.map((v) => [v, v.toUpperCase()]) }, { key: "side", title: "Side", opts: [["long", "Long"], ["short", "Short"]] }];
  return (
    <section className="stack forward">
      <div className="card stack">
        <div className="cardhead"><h2>Signal log (research)</h2><span className="row gap"><span className="badge">frozen · no new rows</span><a className="btn sm" href={`/api/forward?format=csv&${qs(ver, f)}`} download>Export CSV</a></span></div>
        <p className="small"><b>Not the forward test.</b> Since v3.0 nothing new is logged here; rows still open keep resolving and nothing is deleted. Until then, every hour Signal scanned every Bulk market that is trading (and the same coin on Hyperliquid) on 15m, 1H, 4H and 1D. and saved all 3 zones of every setup.</p>
        <p className="dim small"><b>Win</b> = TP1 reached after filling (all-in on TP1). <b>Loss</b> = stop first (a stop and a target in the same candle counts as a stop). <b>Expired</b> = price never reached the zone within 24 candles. Average R is after taker fees on both sides. Only finished candles are used. Real, unseen data, but young: small numbers swing a lot. Not financial advice.</p>
        <div className="row gap wrap"><label className="lbl" htmlFor="fwd-ver">Rules version</label>
          <select id="fwd-ver" className="input" value={ver} onChange={(e) => setVer(e.target.value)}>{[...VERSIONS, "all"].map((v) => { const n = v === "all" ? d.versions?.reduce((a, x) => a + x.n, 0) : d.versions?.find((x) => x.version === v)?.n; return <option key={v} value={v}>{(VERSION_LABEL as Record<string, string>)[v]} ({n ?? 0})</option>; })}</select>
          {d.lastRun && <span className="dim small">Last update {wib(d.lastRun.at)}.</span>}</div>
        <div className="ffilters">
          {sel("venue", "Venue", fc.venue.map((v) => [v, VN[v] ?? v]))}{sel("symbol", "Coin", fc.symbol.map((v) => [v, v]))}{sel("tf", "Timeframe", fc.tf.map((v) => [v, v.toUpperCase()]))}
          {sel("side", "Side", [["long", "Long"], ["short", "Short"]])}{sel("zone", "Zone", [["1", "Z1"], ["2", "Z2"], ["3", "Z3"]])}{sel("status", "Status", Object.entries(STATUS5) as [string, string][])}
          <label className="fsel"><span className="lbl">From</span><input className="input" type="date" value={f.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
          <label className="fsel"><span className="lbl">To</span><input className="input" type="date" value={f.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
          {Object.values(f).some(Boolean) && <button className="btn ghost sm" onClick={() => setF({})}>Clear filters</button>}
        </div>
        {!!d.hidden && <p className="dim small">{d.hidden} repeated row{d.hidden === 1 ? "" : "s"} (same setup logged again while still open) hidden from stats, cards and CSV. Nothing is deleted.</p>}
      </div>
      <div className="seg ftabs" role="tablist" aria-label="Fill status">{(["filled", "waiting", "expired", "all"] as const).map((t) => <button key={t} role="tab" aria-selected={(f.fill ?? "all") === t} className={(f.fill ?? "all") === t ? "on" : ""} onClick={() => set("fill", t === "all" ? "" : t)}>{t === "all" ? "All" : (FILL_TABS as Record<string, string>)[t]} <span className="mono dim">{d.tabs?.[t] ?? 0}</span></button>)}</div>
      {!d.total ? <p className="note">No setups match{ver !== "all" ? ` under ${(VERSION_LABEL as Record<string, string>)[ver]}` : ""} yet. New ones appear after the next hourly run.</p> : <>
        <Board s={s} />
        <div className="fbreak">{([["zone", "zone"], ["tf", "timeframe"], ["venue", "venue"], ["side", "side"], ["symbol", "coin"]] as const).map(([k, n]) => <Breakdown key={k} name={n} rows={d.by?.[k] ?? []} />)}</div>
        <h3>Zones <span className="dim small">({d.total} · one row per zone)</span></h3>
        <ZoneTable rows={d.zones ?? []} order={f.order ?? "desc"} onSort={() => set("order", (f.order ?? "desc") === "desc" ? "asc" : "")} hf={(label, groups) => <HeaderFilter label={label} groups={groups} f={f} counts={d.counts} set={set} />} />
        <h3>Latest setups <span className="dim small">({Math.min(40, d.setups?.length ?? 0)} newest)</span></h3>
        <div className="fcards">{d.setups!.map((x) => <Card key={`${x.venue}|${x.symbol}|${x.tf}|${x.side}|${x.candle_t}`} s={x} px={px[`${x.venue}|${x.symbol}`]} prevPx={prev.current[`${x.venue}|${x.symbol}`]} now={now} />)}</div>
      </>}
    </section>
  );
}

// ───────── v3.0: the forward test is a virtual trader running one frozen strategy ─────────
type PT = { id: number; key: string; market: string; side: "long" | "short"; status: string; placed_t: number; entry: number; sl: number; tp: number; risk: number; replaced: number; fill_t: number | null; exit_t: number | null; exit_px: number | null; exit_reason: string | null; bars: number; cost_r: number | null; funding_r: number | null; funding_src: string | null; r_net: number | null };
type PScore = { n: number; pending: number; open: number; cancelled: number; expired: number; filled: number; fillRate: number | null; winRate: number | null; expR: number | null; ciLo: number | null; ciHi: number | null; pf: number | null; maxDdR: number; totalR: number; verdict: { key: string; label: string; why: string }; equity: { t: number; r: number }[] };
type PData = { configured: boolean; error?: string; strategy?: { id: string; name: string; rulesHash: string; markets: string[] }; lastRun?: { at: string; paper?: string } | null; cursor?: { market: string; last_t: number }[];
  score?: PScore; counts?: Record<string, Record<string, number>>; total?: number; trades?: PT[]; events?: { market: string; trade_key: string | null; kind: string; t: number; data: any }[]; today?: Record<string, { r: number; hit: boolean; limit: number }> };
const r2 = (x: number | null, d = 2) => (x == null || !Number.isFinite(x) ? "–" : `${x >= 0 ? "+" : ""}${x.toFixed(d)}`);
const PSTAT: Record<string, string> = { pending: "Pending order", open: "Open", tp: "TP", sl: "SL", cancelled: "Cancelled", expired: "Expired" };
const pst = (t: PT) => (t.status === "closed" ? (t.exit_reason === "tp" ? "tp" : "sl") : t.status);
const SPEC_URL = "https://github.com/rizzying/signal-terminal/blob/main/docs/FORWARD_SPEC.md";
function Bar({ n, of, label }: { n: number; of: number; label: string }) {
  return <div className="pbar"><div className="row between small"><span>{label}</span><b className="mono">{Math.min(n, of)} / {of}</b></div><div className="ptrack" role="progressbar" aria-valuenow={n} aria-valuemax={of} aria-label={label}><i style={{ width: `${Math.min(100, (100 * n) / of)}%` }} /></div></div>;
}
function Equity({ pts }: { pts: { t: number; r: number }[] }) {
  if (!pts.length) return <p className="note">The equity curve starts with the first closed trade.</p>;
  const ys = [0, ...pts.map((p) => p.r)]; const lo = Math.min(...ys, -1), hi = Math.max(...ys, 1); const W = 600, Hh = 160, x = (i: number) => (i / Math.max(1, pts.length)) * W, y = (v: number) => Hh - ((v - lo) / (hi - lo)) * Hh;
  const d = ys.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return <svg className="eqr" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label={`Equity ${r2(pts.at(-1)!.r)}R after ${pts.length} trades`}>
    <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" /><path d={d} className={pts.at(-1)!.r >= 0 ? "up" : "down"} /></svg>;
}
export function ForwardView() {
  const [f, setF] = useState<Record<string, string | undefined>>({}); const [d, setD] = useState<PData | null>(null); const [err, setErr] = useState(""); const [log, setLog] = useState(false);
  const [idq, setIdq] = useState(""); const idNum = parseTradeId(idq);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null); const toastT = useRef<number>();
  useEffect(() => () => clearTimeout(toastT.current), []);
  const copyId = async (id: string) => { let ok = false; try { await navigator.clipboard.writeText(id); ok = true; } catch { /* blocked */ }
    clearTimeout(toastT.current); setToast({ msg: ok ? `Copied ${id}` : "Copy blocked by the browser", n: Date.now() }); toastT.current = window.setTimeout(() => setToast(null), TOAST_MS); };
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  useEffect(() => { let live = true; setErr(""); fetch(`/api/paper?${q}`).then((r) => r.json()).then((x) => live && setD(x)).catch(() => live && setErr("Couldn't load the forward test right now.")); return () => { live = false; }; }, [q]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v || undefined }));
  if (err) return <section className="card"><p className="alert">{err}</p></section>;
  if (!d) return <section className="card"><p className="dim" role="status">Loading…</p></section>;
  if (!d.configured || d.error) return <section className="card stack"><h2>Forward test</h2><p className="dim">{d.error ?? "The forward test is being set up."}</p></section>;
  const st = d.strategy!, s = d.score!; const live = (d.trades ?? []).filter((t) => t.status === "pending" || t.status === "open"); const tab = f.tab ?? "all"; const rows = (d.trades ?? []).filter((t) => !idNum || String(t.id) === idNum);
  const small = s.n < 30; const V = s.verdict;
  const mk: [string, string][] = st.markets.map((m) => [m, m.replace(/USDT$/, "")]);
  const hf = (label: string, groups: Group[]) => <HeaderFilter label={label} groups={groups} f={f} counts={d.counts} set={set} />;
  const tradeG: Group[] = [{ key: "market", title: "Market", opts: mk }, { key: "side", title: "Side", opts: [["long", "Long"], ["short", "Short"]] }]; const statG: Group[] = [{ key: "status", title: "Status", opts: Object.entries(PSTAT) }];
  const stats: [string, string, string?][] = [
    ["Closed trades", `${s.n}`, `${s.open} open · ${s.pending} pending`],
    ["Expectancy (R, after costs)", s.expR == null ? "–" : `${r2(s.expR)}R`, s.ciLo == null ? "95% CI after 2 trades" : `95% CI ${r2(s.ciLo)} to ${r2(s.ciHi)}R`],
    ["Profit factor", s.pf == null ? "–" : s.pf === Infinity || s.pf === null ? "∞" : s.pf.toFixed(2)],
    ["Max drawdown", `${s.maxDdR.toFixed(2)}R`, "stat only"],
    ["Fill rate", s.fillRate == null ? "–" : `${Math.round(100 * s.fillRate)}%`, `${s.filled} filled · ${s.cancelled} cancelled · ${s.expired} expired`],
    ["Win rate", s.winRate == null ? "–" : `${Math.round(100 * s.winRate)}%`, `total ${r2(s.totalR)}R`]];
  return (
    <section className="stack rise forward">
      <div className="card stack">
        <div className="cardhead"><h2>Forward test · {st.name}</h2><span className="row gap"><span className={`badge v-${V.key}`} title={V.why}>{V.label}</span><a className="btn sm" href={`/api/paper?format=csv&${q}${idNum ? `&id=${idNum}` : ""}`} download>Export CSV</a></span></div>
        <p className="small">One frozen strategy, paper-traded like a real account: a virtual trader per market (<b>{mk.map((m) => m[1]).join(", ")}</b>, Binance <b>spot</b> 1H candles) with at most one resting limit order and one position. Zone 2 entry, stop beyond the zone, all out at <b>3R</b>. A moved setup cancels and replaces the order; an order that never fills is no trade.</p>
        <p className="dim small">Fills need price to trade <i>through</i> the entry by max(1 tick, 0.02%). Costs: Binance futures maker 0.02% / taker 0.05%, 0.02% spread and 0.05% slippage on stops, plus funding. Stop and target in one candle = stop. Rules hash <code>{st.rulesHash}</code> · <a href={SPEC_URL} target="_blank" rel="noreferrer">spec</a> · {st.id}{d.lastRun && <> · last run {wib(d.lastRun.at)}</>}</p>
        <div className="pbars"><Bar n={s.n} of={30} label="First read (30 closed trades)" /><Bar n={s.n} of={100} label="Decision (100 closed trades)" /></div>
        <p className="small"><b>{V.label}:</b> {V.why}. Kill: upper CI below 0 after 30 trades. Promote: lower CI above 0 at 100 trades. Daily limit: a market that loses 3R in a WIB day cancels its order and pauses until midnight WIB (open positions run on).</p>
      </div>
      <div className="statrow">{stats.map(([k, v, sub]) => <div key={k} className="card stat"><span className="lbl">{k}</span><b className="mono">{v}</b>{sub && <span className="dim small">{sub}</span>}{small && k !== "Closed trades" && s.n > 0 && <span className="badge">small sample</span>}</div>)}</div>
      <div className="fgrid">
        <div className="card"><h3>Equity (R, closed trades)</h3><Equity pts={s.equity} /></div>
        <div className="card"><h3>Now</h3>{st.markets.map((m) => { const t = live.find((x) => x.market === m); const td = d.today?.[m]; return <div key={m} className="row between nowrow"><b>{m.replace(/USDT$/, "")} <span className={`mono small ${td && td.r < 0 ? "neg" : td && td.r > 0 ? "pos" : "dim"}`} title="Realized R today (WIB)">today {r2(td?.r ?? 0)}R</span>{td?.hit && <span className="badge v-kill" title="Lost 3R today: no new orders until 00:00 WIB">daily limit hit</span>}</b>{t ? <span className="small">{t.status === "open" ? "Position" : "Limit order"} <span className={`badge ${t.side}`}>{t.side}</span> @ <b className="mono">{fmt(t.entry)}</b> · SL <span className="neg mono">{fmt(t.sl)}</span> · TP <span className="pos mono">{fmt(t.tp)}</span>{t.replaced ? ` · moved ${t.replaced}×` : ""}</span> : <span className="dim small">{td?.hit ? "paused until 00:00 WIB" : "flat, no setup"}</span>}</div>; })}
          {!!d.events?.length && <><h4 className="lbl">Latest events</h4><ul className="evlist small">{d.events.slice(0, 8).map((e, i) => <li key={i}><span className="dim">{wib(Number(e.t))}</span> {e.market.replace(/USDT$/, "")} <b>{e.kind === "limit" ? "daily limit hit" : e.kind}</b>{e.kind === "replace" ? ` → ${fmt(e.data?.to?.entry)}` : e.kind === "place" ? ` ${e.data?.side} @ ${fmt(e.data?.entry)}` : e.kind === "close" ? ` ${e.data?.reason} ${r2(e.data?.r_net)}R` : ""}</li>)}</ul></>}</div>
      </div>
      <div className="seg ftabs" role="tablist" aria-label="Trades">{[["filled", "Filled"], ["notfilled", "Not filled"], ["cancelled", "Cancelled"], ["expired", "Expired"], ["all", "All"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => set("tab", k === "all" ? "" : k)}>{l} <span className="mono dim">{d.counts?.tab?.[k] ?? 0}</span></button>)}</div>
      <div className="card">
        <div className="row gap wrap idsearch"><label className="lbl" htmlFor="fid">Find ID</label><input id="fid" className="mono" type="search" inputMode="text" placeholder="e.g. F-12" value={idq} onChange={(e) => setIdq(e.target.value)} aria-label="Find trade by ID" style={{ width: "9em" }} />{idq && !idNum && <span className="dim small">type a number like 12 or F-12</span>}</div>
        <div className="zfilters-m row gap wrap"><span className="lbl">Filter</span>{hf("Trade", tradeG)}{hf("Status", statG)}</div>
        {idNum && !rows.length ? <p className="note">No trade F-{idNum} in this view. Try the All tab or clear filters.</p> : !rows.length ? <p className="note">No trades in this view yet. Orders appear after the next hourly run when a Zone 2 setup shows.</p> :
        <table className="rt ztable"><thead><tr><th>ID</th><th>Placed</th><th>{hf("Trade", tradeG)}</th><th>Entry</th><th>Stop</th><th>TP (3R)</th><th>Filled</th><th>Closed</th><th>{hf("Status", statG)}</th><th>Result</th></tr></thead>
          <tbody>{rows.map((t) => <tr key={t.key}><td data-label="ID"><button className="btn ghost sm mono" title="Copy ID" aria-label={`Copy ID ${tradeId(t)}`} onClick={() => copyId(tradeId(t))}>{tradeId(t)}</button></td><td data-label="Placed">{wib(Number(t.placed_t))}</td><td data-label="Trade"><b>{t.market.replace(/USDT$/, "")}</b> <span className={`badge ${t.side}`}>{t.side}</span>{t.replaced ? <span className="dim small"> moved {t.replaced}×</span> : null}</td>
            <td data-label="Entry" className="num">{fmt(+t.entry)}</td><td data-label="Stop" className="num neg">{fmt(+t.sl)}</td><td data-label="TP" className="num pos">{fmt(+t.tp)}</td>
            <td data-label="Filled">{t.fill_t ? wib(Number(t.fill_t)) : "–"}</td><td data-label="Closed">{t.exit_t && t.status === "closed" ? <>{wib(Number(t.exit_t))} @ {fmt(+t.exit_px!)}</> : "–"}</td><td data-label="Status">{PSTAT[pst(t)]}</td>
            <td data-label="Result" className={`num ${t.r_net == null ? "" : +t.r_net >= 0 ? "pos" : "neg"}`} title={t.r_net == null ? "" : `costs ${(+t.cost_r!).toFixed(3)}R · funding ${(+t.funding_r!).toFixed(3)}R${t.funding_src === "hl-proxy" ? " (Hyperliquid proxy)" : ""}`}>{t.r_net == null ? "–" : `${r2(+t.r_net)}R`}</td></tr>)}</tbody></table>}
      </div>
      {toast && createPortal(<div key={toast.n} className="toast" role="status" aria-live="polite">{toast.msg}</div>, document.body)}
      <details className="card" open={log} onToggle={(e) => setLog((e.target as HTMLDetailsElement).open)}><summary><b>Signal log (research)</b> <span className="dim small">old per-candle zone log, rules v1–v4 · not counted as trades</span></summary>{log && <SignalLog />}</details>
    </section>
  );
}
