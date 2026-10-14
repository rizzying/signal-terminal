import { useLiveCandle } from "./useLiveCandle";
import { NumField } from "./NumField";
import { setLev, useLev } from "../leverage";
import { checkLiq, mmrFor } from "../engine/liq";
import { useEffect, useMemo, useRef, useState } from "react";
import { candles as loadCandles, feeFor, marketsCached, roundTick, tfsFor, topOfBook, type Book, type Exchange, type Market, type TF } from "../api/markets";
import type { Candle } from "../engine/indicators";
import { analyze, fmt, roundSetup, type Analysis, HTF, MIN_CANDLES, scan, type Dir, type Setup } from "../engine/scan";
import type { Settings } from "../engine/settings";
import { db, type ChecklistItem } from "../journal/db";
import { Chart } from "./Chart";
import { AlertsCard, addAlert } from "./Alerts";
import { copyText, setupText } from "./copySetup";
import { StrategySelect } from "./StrategyPicker";
import type { Strategy } from "../strategies";
import { baseAsset } from "../api/funding";
import { oiHistory, type OIPoint } from "../api/positioning";

const EX: { id: Exchange; name: string }[] = [{ id: "hyperliquid", name: "Hyperliquid" }, { id: "bulk", name: "Bulk" }, { id: "binance", name: "Binance" }];
const DEF_SYM: Record<Exchange, string> = { hyperliquid: "BTC", bulk: "BTC-USD", binance: "BTCUSDT" };
type Cmp = { symbol: string; label: string; setup: Setup; book: Book | null; at: number };
export type Draft = { exchange: Exchange; symbol: string; tf: TF; setup: Setup; zone: number; checklist: Record<string, boolean>; leverage?: number; liq?: number };

export function ScanView({ settings, theme, onJournal, stratId, onPickStrategy }: { settings: Settings; theme: string; onJournal: (d: Draft) => void; stratId: string; onPickStrategy: (s: Strategy) => void }) {
  const [ex, setEx] = useState<Exchange>(() => (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid");
  const [sym, setSym] = useState<string>(() => localStorage.getItem("sig.sym") || DEF_SYM[ex]);
  const [tf, setTf] = useState<TF>(() => (localStorage.getItem("sig.tf") as TF) || "4h");
  const [missing, setMissing] = useState<string | null>(null);
  const levRaw = useLev(stratId, settings.leverage ?? 5); const setLevS = (v: number) => setLev(stratId, v);
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
    marketsCached(ex).then((m) => { if (!live) return; setMarkets(m); setMarketsFor(ex); setMissing(null); if (!m.some((x) => x.symbol === sym)) { const b = baseAsset(sym); const same = m.find((x) => baseAsset(x.symbol) === b)?.symbol; const next = same ?? m.find((x) => x.symbol === DEF_SYM[ex])?.symbol ?? m[0]?.symbol ?? DEF_SYM[ex]; if (!same) setMissing(`${b} isn't listed on ${EX.find((e) => e.id === ex)!.name}, so this shows ${baseAsset(next)}.`); setSym(next); } }).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [ex]);
  useEffect(() => {
    let live = true; setLoading(true); setErr(null); setBook(null);
    if (marketsFor !== ex || !markets.some((m) => m.symbol === sym)) { setLoading(marketsFor !== ex); return () => { live = false; }; } // wait for the market list / symbol remap after an exchange switch
    loadCandles(ex, sym, tf, 400).then((c) => { if (live) setData(c); }).catch((e) => live && setErr(String(e.message ?? e))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ex, sym, tf, markets, marketsFor]);
  const [showOi, setShowOi] = useState(() => localStorage.getItem("sig.oi") !== "0"); const [oi, setOi] = useState<OIPoint[] | null | undefined>(undefined); // undefined = loading, null = not available
  useEffect(() => { localStorage.setItem("sig.oi", showOi ? "1" : "0"); if (!showOi) { setOi(null); return; } let live = true; setOi(undefined); oiHistory(baseAsset(sym), tf, 400).then((x) => live && setOi(x)).catch(() => live && setOi(null)); return () => { live = false; }; }, [sym, tf, showOi]);
  const market = markets.find((m) => m.symbol === sym);
  const lev = Math.min(levRaw, market?.maxLev ?? 100); // capped to this market's max
  const analysis = useMemo(() => (data.length >= MIN_CANDLES ? analyze(data, settings, market?.maxLev, mmrFor(ex, market?.maxLev)) : null), [data, settings, market, ex]);
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return (s ? markets.filter((m) => m.label.toLowerCase().includes(s) || m.symbol.toLowerCase().includes(s)) : markets).slice(0, 60); }, [q, markets]);
  async function run(dir: Dir, auto = false) {
    setBusy(dir); setErr(null);
    try {
      const h = HTF[tf]; const [htf, bk] = await Promise.all([settings.useHtf && h ? loadCandles(ex, sym, h as TF, 200).catch(() => null) : null, topOfBook(ex, sym).catch(() => null)]);
      const st = scan(data, dir, settings, { maxLev: market?.maxLev, mmr: mmrFor(ex, market?.maxLev), htf, htfTf: h, costs: bk ? { spread: bk.spread, feePct: feeFor(ex, settings) } : { spread: 0, feePct: feeFor(ex, settings) } });
      setSetup(market?.tick ? roundSetup(st, (p, m) => roundTick(p, market.tick, m)) : st); setBook(bk); setLastDir(dir); ranFor.current = [data, settings]; if (!auto) { setZone(1); setTicks({}); }
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
  // a Scan long/short tap on Today: run that side once the chart data is ready
  const auto = useRef<Dir | null>((sessionStorage.getItem("sig.autoscan") as Dir) || null);
  useEffect(() => { sessionStorage.removeItem("sig.autoscan"); }, []);
  useEffect(() => { if (auto.current && analysis && !loading && !busy && marketsFor === ex) { const d = auto.current; auto.current = null; run(d); } }, [analysis, loading, busy, marketsFor, ex]);
  const saveChecklist = (c: ChecklistItem[]) => { setChecklist(c); db.set("checklist", c); };
  const { candle: liveC, mode: liveMode } = useLiveCandle(ex, sym, tf, marketsFor === ex);
  const last = liveC && data.length && liveC.t >= data.at(-1)!.t ? liveC : data.at(-1);
  return (
    <section className="stack rise scanpage">
      <div className="card controls">
        <div className="seg" role="tablist" aria-label="Exchange">{EX.map((e) => <button key={e.id} role="tab" aria-selected={ex === e.id} className={ex === e.id ? "on" : ""} onClick={() => setEx(e.id)}>{e.name}</button>)}</div>
        <div className="symbox">
          <label className="lbl" htmlFor="sym">Symbol</label>
          <input id="sym" className="input" autoComplete="off" placeholder={market?.label ?? sym} value={open ? q : market?.label ?? sym} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
          {open && <ul className="menu" role="listbox">{filtered.map((m) => <li key={m.symbol}><button role="option" aria-selected={m.symbol === sym} onMouseDown={(e) => e.preventDefault()} onClick={() => { setSym(m.symbol); setOpen(false); setMissing(null); }}>{m.label}<span className="mono dim">{m.maxLev}x</span></button></li>)}{!filtered.length && <li className="dim pad">{markets.length ? "No match" : "Loading markets…"}</li>}</ul>}
          <span className="mono dim small">{markets.length} markets</span>
        </div>
        <div className="seg" role="tablist" aria-label="Timeframe">{tfsFor(ex).map((t) => <button key={t} role="tab" aria-selected={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t.toUpperCase()}</button>)}</div>
      </div>
      <div className="card chartcard">
        <div className="cardhead"><span className="lbl">{market?.label ?? sym} · {tf.toUpperCase()} · {EX.find((e) => e.id === ex)!.name}</span><span className="row gap"><button className={`chip ${showOi ? "on" : ""}`} aria-pressed={showOi} onClick={() => setShowOi(!showOi)}>OI line{showOi && oi === null ? " (n/a)" : ""}</button><span className="mono" aria-live="off">{last ? fmt(last.c) : loading ? "Loading…" : "–"}</span>{last && <span className={`livedot ${liveMode}`} title={liveMode === "live" ? "Live (WebSocket)" : "Updating every 15s"} aria-label={liveMode === "live" ? "Live prices" : "Prices update every 15 seconds"} />}</span></div>
        {missing && <p className="note small" role="status">{missing}</p>}
        {err && <p className="alert" role="alert">{err}</p>}
        {!loading && !err && data.length > 0 && data.length < MIN_CANDLES && <p className="alert" role="status">Only {data.length} candles on {tf.toUpperCase()} for this market (needs {MIN_CANDLES} to scan). Try a lower timeframe.</p>}
        <Chart candles={data} analysis={analysis} setup={setup} zone={zone} yourLiq={(() => { const z = setup?.zones[zone]; if (!setup || !z || ex === "binance") return null; const c = checkLiq(z, setup.dir, lev, mmrFor(ex, market?.maxLev), market?.maxLev); return c.beforeStop ? c.liq : null; })()} theme={theme} viewKey={`${ex}|${sym}|${tf}`} oi={showOi ? oi ?? null : null} live={liveC} />
      </div>
      <div className="card controls"><StrategySelect value={stratId} onChange={onPickStrategy} current={settings} zone={zone} /></div>
      <div className="scanrow">
        <button className="btn long" disabled={!analysis || !!busy} onClick={() => run("long")}>{busy === "long" ? "Scanning…" : "Scan long"}</button>
        <button className="btn short" disabled={!analysis || !!busy} onClick={() => run("short")}>{busy === "short" ? "Scanning…" : "Scan short"}</button>
      </div>
      {setup && <div className="scanside stack">{setup && <Result meta={{ market: market?.label ?? sym, exchange: EX.find((e) => e.id === ex)!.name, tf }} lev={lev} setLev={setLevS} mmr={ex === "binance" ? null : mmrFor(ex, market?.maxLev)} maxLev={market?.maxLev} analysis={analysis} book={book} ex={ex} setup={setup} zone={zone} setZone={setZone} onJournal={() => onJournal({ exchange: ex, symbol: sym, tf, setup, zone, checklist: ticks, ...(ex === "binance" ? {} : { leverage: lev, liq: checkLiq(setup.zones[zone], setup.dir, lev, mmrFor(ex, market?.maxLev)).liq }) })} onAlert={() => { const z = setup.zones[zone]; addAlert({ exchange: ex, symbol: sym, kind: "zone", lo: z.bottom, hi: z.top, label: `${setup.dir} Zone ${z.rank} entry ${fmt(z.bottom)}–${fmt(z.top)}` }); }} threshold={settings.threshold} />}<AlertsCard /></div>}
      {setup && Object.keys(cmp).length > 0 && <Compare cmp={cmp} current={ex} zone={zone} onPick={(e) => setEx(e)} dir={setup.dir} />}
      {!setup && <AlertsCard />}
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

function Result({ meta, lev, setLev, mmr, maxLev, analysis, book, ex, setup, zone, setZone, onJournal, onAlert, threshold }: { meta: { market: string; exchange: string; tf: string }; lev: number; setLev: (n: number) => void; mmr: number | null; maxLev?: number; analysis?: Analysis | null; book: Book | null; ex: Exchange; setup: Setup; zone: number; setZone: (n: number) => void; onJournal: () => void; onAlert: () => void; threshold: number }) {
  const [alerted, setAlerted] = useState<number | null>(null);
  const s = setup; const [toast, setToast] = useState<string | null>(null);
  const pick = async (i: number) => { setZone(i); const z = s.zones[i]; const c = mmr != null ? checkLiq(z, s.dir, lev, mmr, maxLev) : null;
    const ok = await copyText(setupText({ ...meta, dir: s.dir, zone: z, confidence: s.confidence, band: s.band, lev: c ? lev : null, liq: c?.liq ?? null, liqBeforeStop: c?.beforeStop, at: Date.now() }));
    setToast(ok ? `Copied Zone ${i + 1} setup` : "Zone selected. Copy blocked by the browser"); setTimeout(() => setToast(null), 1800); };
  return (
    <div className={`card result ${s.dir} rise`}>
      <div className="cardhead">
        <div className="row wrap gap"><span className={`badge ${s.dir}`}>{s.dir.toUpperCase()}</span><span className="hero">{s.band}</span><span className="mono dim">{s.confidence}% · structure {s.structureOk ? "✓" : "✕"} + {s.othersAgree}/{s.othersTotal}</span>
          <span className="info" tabIndex={0} title="Share of signals on this timeframe that agree with this direction. Higher timeframes never change it. It is NOT the probability the trade wins: our backtests found agreement wasn't predictive.">ⓘ signals agreeing, not win chance</span></div>
      </div>
      {s.htf && <p className="dim small htfnote">HTF bias (context only, never scored or blocking): {s.htf.detail}{s.htf.agrees == null ? "" : s.htf.agrees ? " (same direction)" : " (opposite direction)"}.</p>}
      <div className="meter" aria-hidden><div style={{ width: `${s.confidence}%` }} />{threshold > 0 && <i style={{ left: `${threshold}%` }} />}</div>
      {s.shown ? <p className="dim small">Setup rule met. Zones below.</p> : <p className="alert">No setup: {s.reason}. Zones are shown for reference only.</p>}
      <ul className="signals">{s.signals.map((g) => <li key={g.key} className={g.pass ? "pass" : "fail"}><span aria-label={g.pass ? "passed" : "failed"}>{g.pass ? "✓" : "✕"}</span><b>{g.name}</b><span className="dim">{g.detail}</span></li>)}</ul>
      {mmr != null ? <div className="row gap wrap levrow"><label className="lbl" htmlFor="lev">Your leverage</label>
        <NumField id="lev" label="Your leverage" min={1} max={maxLev ?? 100} step={1} steppers value={lev} onCommit={setLev} />
        <span className="dim small">× · for the liquidation check below (est., isolated margin, maintenance {(mmr * 100).toFixed(2)}%)</span></div>
        : <p className="dim small">Spot market: no leverage, no liquidation.</p>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="zones" role="tablist" aria-label="Entry zones">
        {s.zones.map((z, i) => (
          <button key={i} role="tab" aria-selected={zone === i} className={`zone ${zone === i ? "on" : ""}`} onClick={() => pick(i)} title="Select this zone and copy the setup">
            <div className="row between"><span className="lbl">Zone {z.rank} · {z.name}</span>{z.ready ? <span className="badge long">In zone</span> : <span className="badge">Wait</span>}</div>
            <dl className="zkv">
              {([["Entry", `${fmt(z.bottom)} – ${fmt(z.top)}`, ""], ["Median", fmt(z.entry), ""], ["Stop", fmt(z.stop), "neg"], ["TP1", fmt(z.t1), "pos"], ["TP2", fmt(z.t2), "pos"], ["R:R TP1 / TP2", `${z.rr1.toFixed(1)}R / ${z.rr2.toFixed(1)}R`, ""], ...(mmr != null ? [[`Your liq (${lev}×)`, fmt(checkLiq(z, s.dir, lev, mmr).liq), checkLiq(z, s.dir, lev, mmr).beforeStop ? "neg" : ""]] : [])] as const).map(([k, v, c]) => <div className="zr" key={k}><dt>{k}</dt><dd className={c}>{v}</dd></div>)}
            </dl>
            {mmr != null && (() => { const c = checkLiq(z, s.dir, lev, mmr, maxLev); return c.beforeStop ? <span className="alert small" role="alert">Liquidated before stop at {lev}×. Use max {c.maxSafe}× or lower.</span> : null; })()}
            {z.pastStop ? <span className="alert small">Price is already past the stop: this zone is invalid for now.</span> : z.pastTp1 ? <span className="alert small">Price already beyond TP1. Wait for a retrace into the entry zone.</span> : null}
            <span className="dim small zcost">Costs {fmt(z.costs.total)} (spread {fmt(z.costs.spread)} + fees {fmt(z.costs.fees)}{z.costs.slip ? ` + slip ${fmt(z.costs.slip)}` : ""})</span>
            <span className="dim small zcost">Stop widened from {fmt(z.rawStop)}</span>
            <span className="dim small">{z.source}{z.note ? ` · ${z.note}` : ""}</span>
            {(() => { const L = setup.dir === "long"; const lq = analysis?.liq.filter((b) => (L ? b.long : b.short) > 0 && b.price >= z.bottom && b.price <= z.top) ?? []; return lq.length ? <span className="dim small">{L ? "Longs" : "Shorts"} liq zone (other traders) inside this entry zone at {lq.map((b) => fmt(b.price)).join(", ")}.</span> : null; })()}
          </button>
        ))}
      </div>
      <p className="mono small">{book ? <>Live spread {fmt(book.spread)} ({(book.spreadPct * 100).toFixed(4)}%) · bid {fmt(book.bid)} / ask {fmt(book.ask)}</> : "Spread unavailable (not included)"} · R:R is after spread, fees and slippage</p>
      <p className="dim small">Dotted grey “Shorts/Longs liq zone” lines are where <b>other traders</b> are estimated to get liquidated, from this exchange’s volume, max leverage and margin rules. They are market levels and can become “Liq zone” entries. They are not your position. Your own liquidation is in each zone card; a red “Your liq” line appears only if it comes before your stop.</p>
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
