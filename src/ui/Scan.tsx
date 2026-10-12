import { useEffect, useMemo, useRef, useState } from "react";
import { candles as loadCandles, feeFor, listMarkets, TFS, topOfBook, type Book, type Exchange, type Market, type TF } from "../api/markets";
import type { Candle } from "../engine/indicators";
import { analyze, fmt, HTF, MIN_CANDLES, scan, type Dir, type Setup } from "../engine/scan";
import type { Settings } from "../engine/settings";
import { db, type ChecklistItem } from "../journal/db";
import { Chart } from "./Chart";
import { AlertsCard, addAlert } from "./Alerts";
import { baseAsset } from "../api/funding";
import { oiHistory, type OIPoint } from "../api/positioning";

const EX: { id: Exchange; name: string }[] = [{ id: "hyperliquid", name: "Hyperliquid" }, { id: "bulk", name: "Bulk" }, { id: "binance", name: "Binance" }];
const DEF_SYM: Record<Exchange, string> = { hyperliquid: "BTC", bulk: "BTC-USD", binance: "BTCUSDT" };
type Cmp = { symbol: string; label: string; setup: Setup; book: Book | null; at: number };
export type Draft = { exchange: Exchange; symbol: string; tf: TF; setup: Setup; zone: number; checklist: Record<string, boolean> };

export function ScanView({ settings, theme, onJournal }: { settings: Settings; theme: string; onJournal: (d: Draft) => void }) {
  const [ex, setEx] = useState<Exchange>(() => (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid");
  const [sym, setSym] = useState<string>(() => localStorage.getItem("sig.sym") || DEF_SYM[ex]);
  const [tf, setTf] = useState<TF>(() => (localStorage.getItem("sig.tf") as TF) || "4h");
  const [markets, setMarkets] = useState<Market[]>([]); const [marketsFor, setMarketsFor] = useState<Exchange | null>(null); const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const [data, setData] = useState<Candle[]>([]); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null); const [zone, setZone] = useState(1); const [lastDir, setLastDir] = useState<Dir | null>(null);
  const [book, setBook] = useState<Book | null>(null); const [cmp, setCmp] = useState<Partial<Record<Exchange, Cmp>>>({});
  const cmpFor = useRef(""); const [busy, setBusy] = useState<Dir | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]); const [ticks, setTicks] = useState<Record<string, boolean>>({}); const [newRule, setNewRule] = useState("");
  useEffect(() => { db.get<ChecklistItem[]>("checklist").then((c) => setChecklist(c ?? [])); }, []);
  useEffect(() => { localStorage.setItem("sig.ex", ex); localStorage.setItem("sig.sym", sym); localStorage.setItem("sig.tf", tf); }, [ex, sym, tf]);
  useEffect(() => {
    let live = true; setMarkets([]);
    listMarkets(ex).then((m) => { if (!live) return; setMarkets(m); setMarketsFor(ex); if (!m.some((x) => x.symbol === sym)) { const b = baseAsset(sym); setSym(m.find((x) => baseAsset(x.symbol) === b)?.symbol ?? m.find((x) => x.symbol === DEF_SYM[ex])?.symbol ?? m[0]?.symbol ?? DEF_SYM[ex]); } }).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [ex]);
  useEffect(() => {
    let live = true; setLoading(true); setErr(null); setBook(null);
    if (marketsFor !== ex || !markets.some((m) => m.symbol === sym)) { setLoading(marketsFor !== ex); return () => { live = false; }; } // wait for the market list / symbol remap after an exchange switch
    loadCandles(ex, sym, tf, 400).then((c) => { if (live) setData(c); }).catch((e) => live && setErr(String(e.message ?? e))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ex, sym, tf, markets, marketsFor]);
  const [showOi, setShowOi] = useState(() => localStorage.getItem("sig.oi") !== "0"); const [oi, setOi] = useState<OIPoint[] | null>(null);
  useEffect(() => { localStorage.setItem("sig.oi", showOi ? "1" : "0"); if (!showOi) { setOi(null); return; } let live = true; oiHistory(baseAsset(sym), tf, 400).then((x) => live && setOi(x)).catch(() => live && setOi(null)); return () => { live = false; }; }, [sym, tf, showOi]);
  const market = markets.find((m) => m.symbol === sym);
  const analysis = useMemo(() => (data.length >= MIN_CANDLES ? analyze(data, settings, market?.maxLev) : null), [data, settings, market]);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return (s ? markets.filter((m) => m.label.toLowerCase().includes(s) || m.symbol.toLowerCase().includes(s)) : markets).slice(0, 60); }, [q, markets]);
  async function run(dir: Dir, auto = false) {
    setBusy(dir); setErr(null);
    try {
      const h = HTF[tf]; const [htf, bk] = await Promise.all([settings.useHtf && h ? loadCandles(ex, sym, h as TF, 200).catch(() => null) : null, topOfBook(ex, sym).catch(() => null)]);
      const st = scan(data, dir, settings, { maxLev: market?.maxLev, htf, htfTf: h, costs: bk ? { spread: bk.spread, feePct: feeFor(ex, settings) } : { spread: 0, feePct: feeFor(ex, settings) } });
      setSetup(st); setBook(bk); setLastDir(dir); ranFor.current = [data, settings]; if (!auto) { setZone(1); setTicks({}); }
      const key = `${baseAsset(sym)}|${tf}|${dir}`; const row = { symbol: sym, label: market?.label ?? sym, setup: st, book: bk, at: Date.now() };
      setCmp((p) => (cmpFor.current === key ? { ...p, [ex]: row } : { [ex]: row })); cmpFor.current = key;
    } catch (e: any) { setSetup(null); setErr(e.message ?? String(e)); } finally { setBusy(null); }
  }
  // keep the scan when switching exchange/symbol/timeframe or editing settings: re-run the same side automatically
  const ranFor = useRef<unknown>(null);
  useEffect(() => {
    if (!lastDir || loading || busy) return; const k = [data, settings]; if (ranFor.current && (ranFor.current as unknown[])[0] === data && (ranFor.current as unknown[])[1] === settings) return;
    ranFor.current = k; if (analysis && data.length >= MIN_CANDLES) run(lastDir, true); else if (data.length) setSetup(null);
  }, [data, settings, loading]);
  const saveChecklist = (c: ChecklistItem[]) => { setChecklist(c); db.set("checklist", c); };
  const last = data.at(-1);
  return (
    <section className="stack rise">
      <div className="card controls">
        <div className="seg" role="tablist" aria-label="Exchange">{EX.map((e) => <button key={e.id} role="tab" aria-selected={ex === e.id} className={ex === e.id ? "on" : ""} onClick={() => setEx(e.id)}>{e.name}</button>)}</div>
        <div className="symbox">
          <label className="lbl" htmlFor="sym">Symbol</label>
          <input id="sym" className="input" autoComplete="off" placeholder={market?.label ?? sym} value={open ? q : market?.label ?? sym} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
          {open && <ul className="menu" role="listbox">{filtered.map((m) => <li key={m.symbol}><button role="option" aria-selected={m.symbol === sym} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSym(m.symbol); setOpen(false); }}>{m.label}<span className="mono dim">{m.maxLev}x</span></button></li>)}{!filtered.length && <li className="dim pad">{markets.length ? "No match" : "Loading markets…"}</li>}</ul>}
          <span className="mono dim small">{markets.length} markets</span>
        </div>
        <div className="seg" role="tablist" aria-label="Timeframe">{TFS.map((t) => <button key={t} role="tab" aria-selected={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t.toUpperCase()}</button>)}</div>
      </div>
      <div className="card chartcard">
        <div className="cardhead"><span className="lbl">{market?.label ?? sym} · {tf.toUpperCase()} · {EX.find((e) => e.id === ex)!.name}</span><span className="row gap"><button className={`chip ${showOi ? "on" : ""}`} aria-pressed={showOi} onClick={() => setShowOi(!showOi)}>OI line{showOi && oi === null ? " (n/a)" : ""}</button><span className="mono">{last ? fmt(last.c) : loading ? "Loading…" : "–"}</span></span></div>
        {err && <p className="alert" role="alert">{err}</p>}
        {!loading && !err && data.length > 0 && data.length < MIN_CANDLES && <p className="alert" role="status">Only {data.length} candles on {tf.toUpperCase()} for this market (needs {MIN_CANDLES} to scan). Try a lower timeframe.</p>}
        <Chart candles={data} analysis={analysis} setup={setup} zone={zone} theme={theme} viewKey={`${ex}|${sym}|${tf}`} oi={showOi ? oi : null} />
      </div>
      <div className="scanrow">
        <button className="btn long" disabled={!analysis || !!busy} onClick={() => run("long")}>{busy === "long" ? "Scanning…" : "Scan long"}</button>
        <button className="btn short" disabled={!analysis || !!busy} onClick={() => run("short")}>{busy === "short" ? "Scanning…" : "Scan short"}</button>
      </div>
      {setup && <Result book={book} ex={ex} setup={setup} zone={zone} setZone={setZone} onJournal={() => onJournal({ exchange: ex, symbol: sym, tf, setup, zone, checklist: ticks })} onAlert={() => { const z = setup.zones[zone]; addAlert({ exchange: ex, symbol: sym, kind: "zone", lo: z.bottom, hi: z.top, label: `${setup.dir} Zone ${z.rank} entry ${fmt(z.bottom)}–${fmt(z.top)}` }); }} threshold={settings.threshold} />}
      {setup && Object.keys(cmp).length > 0 && <Compare cmp={cmp} current={ex} zone={zone} onPick={(e) => setEx(e)} dir={setup.dir} />}
      <AlertsCard />
      <div className="card">
        <div className="cardhead"><h2>My checklist</h2><span className="lbl">device-only</span></div>
        {setup ? <p className="dim small">Tick the rules that hold for this {setup.dir} setup. Compare against Signal's checks above.</p> : <p className="dim small">Your own rules. Run a scan to tick them next to Signal's checks.</p>}
        <ul className="checklist">{checklist.map((c) => <li key={c.id}><label><input type="checkbox" disabled={!setup} checked={!!ticks[c.text]} onChange={(e) => setTicks({ ...ticks, [c.text]: e.target.checked })} />{c.text}</label><button className="btn ghost sm" aria-label={`Remove rule ${c.text}`} onClick={() => saveChecklist(checklist.filter((x) => x.id !== c.id))}>Remove</button></li>)}</ul>
        {setup && checklist.length > 0 && <p className="mono small">You: {Object.values(ticks).filter(Boolean).length}/{checklist.length} · Signal: {setup.signals.filter((s) => s.pass).length}/{setup.signals.length}</p>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); const t = newRule.trim(); if (t) { saveChecklist([...checklist, { id: Math.random().toString(36).slice(2), text: t }]); setNewRule(""); } }}>
          <input className="input grow" aria-label="New rule" placeholder="e.g. 4H trend agrees" value={newRule} onChange={(e) => setNewRule(e.target.value)} /><button className="btn">Add rule</button>
        </form>
      </div>
    </section>
  );
}

function Result({ book, ex, setup, zone, setZone, onJournal, onAlert, threshold }: { book: Book | null; ex: Exchange; setup: Setup; zone: number; setZone: (n: number) => void; onJournal: () => void; onAlert: () => void; threshold: number }) {
  const [alerted, setAlerted] = useState<number | null>(null);
  const s = setup;
  return (
    <div className={`card result ${s.dir} rise`}>
      <div className="cardhead">
        <div className="row gap"><span className={`badge ${s.dir}`}>{s.dir.toUpperCase()}</span><span className="hero">{s.band}</span><span className="mono dim">{s.confidence}% · structure {s.structureOk ? "✓" : "✕"} + {s.othersAgree}/6</span>
          <span className="info" tabIndex={0} title="Share of signals on this timeframe that agree with this direction. Higher timeframes never change it. It is NOT the probability the trade wins: our backtests found agreement wasn't predictive.">ⓘ signals agreeing, not win chance</span></div>
      </div>
      {s.htf && <p className="dim small htfnote">HTF bias (context only, never scored or blocking): {s.htf.detail}{s.htf.agrees == null ? "" : s.htf.agrees ? " (same direction)" : " (opposite direction)"}.</p>}
      <div className="meter" aria-hidden><div style={{ width: `${s.confidence}%` }} />{threshold > 0 && <i style={{ left: `${threshold}%` }} />}</div>
      {s.shown ? <p className="dim small">Setup rule met. Zones below.</p> : <p className="alert">No setup: {s.reason}. Zones are shown for reference only.</p>}
      <ul className="signals">{s.signals.map((g) => <li key={g.key} className={g.pass ? "pass" : "fail"}><span aria-label={g.pass ? "passed" : "failed"}>{g.pass ? "✓" : "✕"}</span><b>{g.name}</b><span className="dim">{g.detail}</span></li>)}</ul>
      <div className="zones" role="tablist" aria-label="Entry zones">
        {s.zones.map((z, i) => (
          <button key={i} role="tab" aria-selected={zone === i} className={`zone ${zone === i ? "on" : ""}`} onClick={() => setZone(i)}>
            <div className="row between"><span className="lbl">Zone {z.rank} · {z.name}</span>{z.ready ? <span className="badge long">In zone</span> : <span className="badge">Wait</span>}</div>
            <div className="kv">
              <span>Entry</span><b>{fmt(z.bottom)} – {fmt(z.top)}</b>
              <span>Median</span><b>{fmt(z.entry)}</b>
              <span>Stop</span><b className="neg">{fmt(z.stop)}</b>
              <span>TP1 / TP2</span><b className="pos">{fmt(z.t1)} / {fmt(z.t2)}</b>
              <span>R:R</span><b>{z.rr1.toFixed(1)}R / {z.rr2.toFixed(1)}R</b>
            </div>
            <span className="dim small costs">Costs {fmt(z.costs.total)} = spread {fmt(z.costs.spread)} + fees {fmt(z.costs.fees)}{z.costs.slip ? ` + slippage ${fmt(z.costs.slip)}` : ""}. Stop widened from {fmt(z.rawStop)}.</span>
            <span className="dim small">{z.source}{z.note ? ` · ${z.note}` : ""}</span>
          </button>
        ))}
      </div>
      <p className="mono small">{book ? <>Live spread {fmt(book.spread)} ({(book.spreadPct * 100).toFixed(4)}%) · bid {fmt(book.bid)} / ask {fmt(book.ask)}</> : "Spread unavailable (not included)"} · R:R is after spread, fees and slippage</p>
      <p className="dim small">Heatmap levels (dotted, “est. liq”) are a model estimate from volume and assumed leverage, not real positions.</p>
      <div className="row wrap gap"><button className="btn primary" onClick={onJournal}>Journal Zone {zone + 1}</button><button className="btn" onClick={() => { onAlert(); setAlerted(zone); }}>{alerted === zone ? "Alert set ✓" : `Alert when price enters Zone ${zone + 1}`}</button></div>
    </div>
  );
}

function Compare({ cmp, current, zone, onPick, dir }: { cmp: Partial<Record<Exchange, Cmp>>; current: Exchange; zone: number; onPick: (e: Exchange) => void; dir: Dir }) {
  const rows = EX.filter((e) => cmp[e.id]);
  return (
    <div className="card">
      <div className="cardhead"><h2>Compare exchanges · Zone {zone + 1} {dir}</h2><span className="lbl">switch exchange to add</span></div>
      <table className="rt cmp"><thead><tr><th>Exchange</th><th>Entry</th><th>Stop</th><th>TP1</th><th>R:R</th><th>Spread</th><th>Setup</th></tr></thead><tbody>
        {rows.map((e) => { const c = cmp[e.id]!; const z = c.setup.zones[zone];
          return <tr key={e.id} className={e.id === current ? "hl" : ""}><td data-label="Exchange"><button className="btn ghost sm" onClick={() => onPick(e.id)} aria-label={`Show ${e.name}`}><b>{e.name}</b></button><span className="dim small"> {c.label}</span></td>
            <td data-label="Entry" className="num">{fmt(z.bottom)}–{fmt(z.top)}</td><td data-label="Stop" className="num neg">{fmt(z.stop)}</td><td data-label="TP1" className="num pos">{fmt(z.t1)}</td>
            <td data-label="R:R" className="num">{z.rr1.toFixed(1)}R</td><td data-label="Spread" className="num">{c.book ? `${(c.book.spreadPct * 100).toFixed(4)}%` : "–"}</td>
            <td data-label="Setup">{c.setup.shown ? "Rule met" : <span className="dim">No</span>} · {c.setup.band}</td></tr>; })}
      </tbody></table>
      {rows.length < 2 && <p className="dim small">Tap another exchange above; the same side re-scans automatically and appears here.</p>}
    </div>
  );
}
