import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, type IChartApi, type SeriesMarker, type Time } from "lightweight-charts";
import { hlRange, listMarkets, TF_MS, TFS, topOfBook, type Market, type TF } from "../api/markets";
import type { Settings } from "../engine/settings";
import { HL_MAX_CANDLES, type BtResult } from "../engine/backtest";
import { fmt } from "../engine/scan";
import type { Candle } from "../engine/indicators";
import { css } from "./Chart";
import { magnify, type MagStats } from "../engine/magnifyFetch";
import type { Resolution } from "../engine/sim";
import { MIN_TRADES } from "../engine/robust";
import { StrategySelect, useStrategyList } from "./StrategyPicker";
import type { Strategy } from "../strategies";

const WARM = 300; const USABLE = HL_MAX_CANDLES - WARM - 5;
const MONTHS = [1, 2, 3, 6, 12]; const DAY = 864e5;
const TF_LABEL: Record<TF, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "12h": "12H", "1d": "1D", "3d": "3D", "1w": "1W" };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function BacktestView({ settings, stratId, theme }: { settings: Settings; stratId: string; theme: string }) {
  const list = useStrategyList();
  const [markets, setMarkets] = useState<Market[]>([]); const [sym, setSym] = useState(() => localStorage.getItem("sig.bt.sym") || "BTC");
  const [sid, setSid] = useState(stratId); const strat = list.find((s) => s.id === sid);
  const [zone, setZone] = useState<0 | 1 | 2>(1); const [ov, setOv] = useState<{ minRR?: number; exitMode?: 0 | 1 | 2; entryOnClose?: boolean; stopAtr?: number }>({}); const [tf, setTf] = useState<TF>("4h"); const [margin, setMargin] = useState(1000);
  const [mode, setMode] = useState<number | "custom">(3); const now = useMemo(() => Date.now(), []);
  const [from, setFrom] = useState(iso(now - 90 * DAY)); const [to, setTo] = useState(iso(now));
  const [busy, setBusy] = useState<number | null>(null); const [stage, setStage] = useState<string | null>(null);
  const [split, setSplit] = useState(() => localStorage.getItem("sig.bt.split") === "1"); const [magOn, setMagOn] = useState(() => localStorage.getItem("sig.bt.mag") !== "0"); const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ r: BtResult; mag: MagStats | null; c: Candle[]; start: number; label: string } | null>(null);
  useEffect(() => { listMarkets("hyperliquid").then(setMarkets).catch(() => setErr("Couldn't load Hyperliquid markets.")); }, []);
  const range = mode === "custom" ? { s: Date.parse(from), e: Math.min(Date.parse(to) + DAY, now) } : { s: now - mode * 30 * DAY, e: now };
  const oldest = now - USABLE * TF_MS[tf]; const bars = Math.round((range.e - range.s) / TF_MS[tf]);
  const block = !(range.e > range.s) ? "End date must be after the start date." : range.s < oldest ? `Too far back for ${TF_LABEL[tf]}: Hyperliquid only serves about ${HL_MAX_CANDLES.toLocaleString()} recent candles (${WARM} are used to warm up the indicators), so the earliest start on ${TF_LABEL[tf]} is ${iso(oldest)}. Pick a shorter range or a bigger timeframe.` : null;
  const run = async () => {
    if (block || !strat) return; setErr(null); setBusy(0); setRes(null);
    try {
      const c = await hlRange(sym, tf, range.s - WARM * TF_MS[tf], range.e);
      const startIdx = c.findIndex((k) => k.t >= range.s); if (startIdx < 30 || c.length - startIdx < 10) throw new Error("Not enough candles for that range.");
      let spreadPct = 0.02; if (strat.settings.useSpread) try { spreadPct = (await topOfBook("hyperliquid", sym)).spreadPct; } catch { /* keep default */ }
      const w = new Worker(new URL("../engine/bt.worker.ts", import.meta.url), { type: "module" });
      const ask = <T,>(msg: unknown) => new Promise<T>((ok, bad) => { w.onmessage = (e) => { if (e.data.progress != null) setBusy(e.data.progress); else if (e.data.error) bad(new Error(e.data.error)); else ok(e.data); }; w.onerror = (e) => bad(new Error(e.message)); w.postMessage(msg); });
      try {
        await ask({ type: "signals", input: { candles: c, startIdx, settings: { ...strat.settings, ...ov }, zone, margin, feePct: strat.settings.feeHyperliquid, spreadPct } });
        let resolved: Record<string, Resolution> = {}; let r = (await ask<{ result: BtResult }>({ type: "run", resolved, split })).result; let mag: MagStats | null = null;
        // Bar magnifier: settle ambiguous candles with smaller candles; re-run because one answer can change the trades after it.
        for (let round = 0; magOn && round < 4 && r.amb.some((a) => !(a.key in resolved)); round++) {
          setStage(`Checking ${r.amb.length} unclear candles with smaller candles…`);
          const m = await magnify(sym, tf, r.amb, resolved); resolved = m.resolved;
          r = (await ask<{ result: BtResult }>({ type: "run", resolved, split })).result;
          mag = { asked: r.amb.length, resolved: r.resolvedCount, noData: r.amb.length - r.resolvedCount };
        }
        if (magOn && !mag) mag = { asked: r.amb.length, resolved: r.resolvedCount, noData: r.amb.length - r.resolvedCount };
        localStorage.setItem("sig.bt.sym", sym);
        setRes({ r, mag, c: c.slice(startIdx), start: startIdx, label: `${sym} · ${TF_LABEL[tf]} · ${strat.name} · Zone ${zone + 1} · ${iso(range.s)} → ${iso(range.e)}` });
      } finally { w.terminate(); setStage(null); }
    } catch (e) { setErr((e as Error).message || "Backtest failed."); } finally { setBusy(null); }
  };
  return (
    <section className="stack">
      <div className="card">
        <div className="cardhead"><h2>Backtest</h2><span className="lbl">Hyperliquid candles · runs on this device</span></div>
        <div className="btform">
          <label><span className="lbl">Asset</span><select className="input" value={sym} onChange={(e) => setSym(e.target.value)}>{(markets.length ? markets : [{ symbol: sym, label: sym, maxLev: 0 }]).map((m) => <option key={m.symbol} value={m.symbol}>{m.label}</option>)}</select></label>
          <StrategySelect value={sid} onChange={(s: Strategy) => setSid(s.id)} zone={zone} />
          <div><span className="lbl">Zone</span><div className="seg" role="group" aria-label="Zone">{[0, 1, 2].map((z) => <button key={z} className={zone === z ? "on" : ""} aria-pressed={zone === z} onClick={() => setZone(z as 0 | 1 | 2)}>{z + 1}</button>)}</div></div>
          <div><span className="lbl">Timeframe</span><div className="seg wrap" role="group" aria-label="Timeframe">{TFS.map((t) => <button key={t} className={tf === t ? "on" : ""} aria-pressed={tf === t} onClick={() => setTf(t)}>{TF_LABEL[t]}</button>)}</div></div>
          <div><span className="lbl">Exit</span><select className="input" aria-label="Exit" value={`${ov.exitMode ?? strat?.settings.exitMode ?? 0}:${ov.minRR ?? strat?.settings.minRR ?? 2}`} onChange={(e) => { const [m, rr] = e.target.value.split(":").map(Number); setOv({ ...ov, exitMode: m as 0 | 1 | 2, minRR: rr }); }}>
            {[1.5, 2, 3].map((rr) => <option key={rr} value={`0:${rr}`}>All at TP1 = {rr}R{rr === 2 ? " (default)" : ""}</option>)}
            {strat && ![1.5, 2, 3].includes(ov.minRR ?? strat.settings.minRR) && <option value={`0:${ov.minRR ?? strat.settings.minRR}`}>All at TP1 = {ov.minRR ?? strat.settings.minRR}R (strategy)</option>}
            <option value="1:2">Half at 2R, rest at 3R</option><option value="2:2">Half at 2R, rest stop to break-even</option></select></div>
          <div><span className="lbl">Entry · stop</span><div className="row gap wrap"><select className="input" aria-label="Entry" value={String(ov.entryOnClose ?? strat?.settings.entryOnClose ?? true)} onChange={(e) => setOv({ ...ov, entryOnClose: e.target.value === "true" })}><option value="true">Candle closes in zone</option><option value="false">First touch (limit)</option></select>
            <select className="input" aria-label="Stop buffer" value={ov.stopAtr ?? strat?.settings.stopAtr ?? 1.5} onChange={(e) => setOv({ ...ov, stopAtr: +e.target.value })}>{[...new Set([0.5, 1, 1.5, 2, strat?.settings.stopAtr ?? 1.5])].sort((a, b) => a - b).map((k) => <option key={k} value={k}>Stop {k}× ATR</option>)}</select></div></div>
          <label><span className="lbl">Margin (USD, 1× all-in)</span><input className="input mono" type="number" min={1} value={margin} onChange={(e) => setMargin(Math.max(1, +e.target.value || 1))} /></label>
          <div><span className="lbl">Range</span><div className="seg wrap" role="group" aria-label="Range">{MONTHS.map((m) => <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>{m}M</button>)}<button className={mode === "custom" ? "on" : ""} aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>Dates</button></div>
            {mode === "custom" && <div className="row gap" style={{ marginTop: 8 }}><input className="input" type="date" aria-label="Start date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><input className="input" type="date" aria-label="End date" value={to} max={iso(now)} onChange={(e) => setTo(e.target.value)} /></div>}</div>
        </div>
        {block ? <p className="note warn" role="alert">{block}</p> : <p className="dim small">≈ {bars.toLocaleString()} candles. Walks forward bar by bar using only closed candles; enters when a candle closes inside the chosen zone (or on first touch), exits at TP1 or the stop (stop wins if both hit in one candle), one position at a time, fees + spread{strat?.settings.slippagePct ? " + slippage" : ""} from the strategy.</p>}
        <div className="row wrap gap toggles">
          <label className="check"><input type="checkbox" checked={split} onChange={(e) => { setSplit(e.target.checked); localStorage.setItem("sig.bt.split", e.target.checked ? "1" : "0"); }} /> <span>Check on unseen data <small className="dim">· first 60% vs last 40%</small></span></label>
          <label className="check"><input type="checkbox" checked={magOn} onChange={(e) => { setMagOn(e.target.checked); localStorage.setItem("sig.bt.mag", e.target.checked ? "1" : "0"); }} /> <span>Bar magnifier <small className="dim">· use smaller candles when a candle hits both stop and target</small></span></label>
        </div>
        <button className="btn primary" disabled={!!block || busy != null || !strat} onClick={run}>{stage ?? (busy != null ? `Running… ${Math.round(busy * 100)}%` : "Run backtest")}</button>
        {err && <p className="note warn" role="alert">{err}</p>}
      </div>
      {res && <Results res={res} theme={theme} margin={margin} />}
      {res?.r.split && <SplitCard s={res.r.split} />}
      {res && <MonteCarloCard r={res.r} theme={theme} />}
      <p className="dim small center">Past results, not a promise. Simulated fills on historical candles; real fills, funding and gaps will differ.</p>
    </section>
  );
}

function Results({ res, theme, margin }: { res: { r: BtResult; mag: MagStats | null; c: Candle[]; label: string }; theme: string; margin: number }) {
  const { r, c } = res; const eqEl = useRef<HTMLDivElement>(null); const pxEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const charts: IChartApi[] = []; const ink2 = css("--ink-2"), line = css("--line-soft"), acc = css("--chart"), ink3 = css("--ink-3"), pos = css("--pos"), neg = css("--neg");
    const opts = { autoSize: true, layout: { background: { color: "transparent" }, textColor: ink2, fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace", fontSize: 12 }, grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true } };
    const T = (t: number) => (t / 1000) as Time;
    const mk = (side: "in" | "out"): SeriesMarker<Time>[] => r.trades.flatMap((t) => side === "in"
      ? [{ time: T(t.entryT), position: t.dir === "long" ? "belowBar" : "aboveBar", color: t.dir === "long" ? pos : neg, shape: t.dir === "long" ? "arrowUp" : "arrowDown", text: t.dir === "long" ? "L" : "S" } as SeriesMarker<Time>]
      : [{ time: T(t.exitT), position: "inBar", color: t.pnl > 0 ? pos : neg, shape: "circle", size: 0.6 } as SeriesMarker<Time>]).sort((a, b) => (a.time as number) - (b.time as number));
    if (eqEl.current) { const ch = createChart(eqEl.current, opts); charts.push(ch);
      const h = ch.addLineSeries({ color: ink3, lineWidth: 1, lineStyle: 2, priceLineVisible: false, title: "Buy & hold" }); h.setData(r.hold.map((p) => ({ time: T(p.t), value: p.v })));
      const e = ch.addLineSeries({ color: acc, lineWidth: 2, priceLineVisible: false, title: "Strategy" }); e.setData(r.equity.map((p) => ({ time: T(p.t), value: p.v })));
      e.setMarkers(mk("in")); ch.timeScale().fitContent(); }
    if (pxEl.current) { const ch = createChart(pxEl.current, opts); charts.push(ch);
      const s = ch.addCandlestickSeries({ upColor: pos, downColor: neg, wickUpColor: pos, wickDownColor: neg, borderVisible: false }); s.setData(c.map((k) => ({ time: T(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
      s.setMarkers([...mk("in"), ...mk("out")].sort((a, b) => (a.time as number) - (b.time as number))); ch.timeScale().fitContent(); }
    return () => charts.forEach((x) => x.remove());
  }, [r, c, theme]);
  const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  return (
    <div className="card">
      <div className="cardhead"><h2>Results</h2><span className="lbl">{res.label}</span></div>
      <div className="stats">
        <div><span className="lbl">Avg per trade</span><b className="mono">{r.trades.length ? `${r.expR >= 0 ? "+" : ""}${r.expR.toFixed(2)}R` : "–"}</b></div>
        <div><span className="lbl">Profitable trades</span><b className="mono">{r.trades.length ? `${r.winRate.toFixed(0)}%` : "–"}</b></div>
        <div><span className="lbl">Wins / losses</span><b className="mono">{r.wins} / {r.losses}</b></div>
        <div><span className="lbl">Total return</span><b className={`mono ${r.totalReturn >= 0 ? "pos" : "neg"}`}>{pct(r.totalReturn)}</b></div>
        <div><span className="lbl">Max drawdown</span><b className="mono">{r.maxDD.toFixed(2)}%</b></div>
        <div><span className="lbl">Buy &amp; hold</span><b className="mono">{pct(r.holdReturn)}</b></div>
        <div><span className="lbl">Final equity</span><b className="mono">${fmt(r.final)} <span className="dim">of ${fmt(margin)}</span></b></div>
      </div>
      <p className="dim small" data-mag>{res.mag ? (res.mag.asked ? `Bar magnifier: ${res.mag.asked} unclear candle${res.mag.asked === 1 ? "" : "s"} (stop and target or entry and stop in one candle). Settled ${res.mag.resolved} with smaller candles${res.mag.noData ? `; ${res.mag.noData} had no finer data, so the stop was assumed first` : ""}.` : "Bar magnifier: no unclear candles in this run.") : `Bar magnifier off: ${r.amb.length} unclear candle${r.amb.length === 1 ? "" : "s"} counted as stop first.`}</p>
      {!r.trades.length && <p className="note">No setups touched their zone in this range. Try another zone, timeframe or a looser strategy.</p>}
      <h3 className="lbl">Equity vs buy &amp; hold <span className="dim">· ▲ long ▼ short entries</span></h3><div ref={eqEl} className="btchart" />
      <h3 className="lbl">Price with trades <span className="dim">· arrows = entries, dots = exits (green win, red loss)</span></h3><div ref={pxEl} className="btchart" />
      {r.trades.length > 0 && <div className="scrollx"><table className="rt"><thead><tr><th>Side</th><th>Entry</th><th>Exit</th><th>Result</th><th>P&amp;L</th></tr></thead><tbody>
        {r.trades.slice().reverse().slice(0, 100).map((t, i) => <tr key={i}><td data-label="Side">{t.dir}</td><td data-label="Entry" className="mono">{fmt(t.entry)} <span className="dim">{new Date(t.entryT).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" })}</span></td><td data-label="Exit" className="mono">{fmt(t.exit)}</td><td data-label="Result">{({ tp1: "TP1", stop: "Stop", be: "½ TP, ½ BE", partial: "½ TP + rest", open: "Open at end" } as const)[t.outcome]}</td><td data-label="P&L" className={`mono ${t.pnl >= 0 ? "pos" : "neg"}`}>{pct(t.pnlPct)}</td></tr>)}
      </tbody></table></div>}
    </div>
  );
}

const sgn = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;
function SplitCard({ s }: { s: NonNullable<BtResult["split"]> }) {
  const cls = s.verdict.label === "Held up" ? "pos" : s.verdict.label === "Fell apart" ? "neg" : "";
  const rows: [string, (h: typeof s.a) => string][] = [["Trades", (h) => String(h.n)], ["Win %", (h) => `${h.win.toFixed(0)}%`], ["Avg per trade", (h) => `${sgn(h.avgR)}R`], ["Return", (h) => `${sgn(h.ret, 1)}%`], ["Max drawdown", (h) => `${h.maxDD.toFixed(1)}%`]];
  return (
    <div className="card" data-split>
      <div className="cardhead"><h2>Check on unseen data</h2><span className={`badge verdict ${cls}`}>{s.verdict.label}</span></div>
      <p className="small">{s.verdict.why}</p>
      <table className="mini split"><thead><tr><th></th><th>First 60%<small className="dim"> · to {new Date(s.at).toISOString().slice(0, 10)}</small></th><th>Last 40%<small className="dim"> · unseen</small></th></tr></thead>
        <tbody>{rows.map(([k, f]) => <tr key={k}><th scope="row">{k}</th><td className="mono">{f(s.a)}</td><td className="mono">{f(s.b)}</td></tr>)}</tbody></table>
      <p className="dim small">Rules: each part needs at least {MIN_TRADES} trades. "Held up" means the unseen part still made money per trade and kept at least half of the first part's average. Settings were not tuned on either part here, so this checks whether one period was just lucky.</p>
    </div>
  );
}
function MonteCarloCard({ r, theme }: { r: BtResult; theme: string }) {
  const mc = r.mc; const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mc || !el.current || mc.n < 2) return; const acc = css("--chart"), ink3 = css("--ink-3"), ink2 = css("--ink-2"), line = css("--line-soft");
    const ch = createChart(el.current, { autoSize: true, handleScroll: false, handleScale: false, layout: { background: { color: "transparent" }, textColor: ink2, fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace", fontSize: 12 }, grid: { vertLines: { visible: false }, horzLines: { color: line } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, visible: false }, crosshair: { vertLine: { visible: false }, horzLine: { visible: false } } });
    const T = (j: number) => (j + 1) as Time; const mk = (d: number[], color: string, w: 1 | 2, style = 0) => ch.addLineSeries({ color, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }).setData(d.map((v, j) => ({ time: T(j), value: v })));
    mk(mc.fan.p95, ink3, 1, 2); mk(mc.fan.p5, ink3, 1, 2); mk(mc.fan.p50, acc, 2); ch.timeScale().fitContent(); return () => ch.remove();
  }, [mc, theme]);
  if (!mc) return null; const pct = (x: number) => `${sgn(x, 1)}%`;
  return (
    <div className="card" data-mc>
      <div className="cardhead"><h2>Likely range</h2><span className="lbl">Monte Carlo · {mc.runs.toLocaleString()} runs of these {mc.n} trades</span></div>
      {mc.n < MIN_TRADES && <p className="note warn" role="alert">Only {mc.n} trades. With fewer than {MIN_TRADES} the range below is very rough.</p>}
      <div className="stats">
        <div><span className="lbl">Typical result</span><b className="mono">{pct(mc.ret[1])}</b></div>
        <div><span className="lbl">Bad case (1 in 20)</span><b className="mono neg">{pct(mc.ret[0])}</b></div>
        <div><span className="lbl">Good case (1 in 20)</span><b className="mono pos">{pct(mc.ret[2])}</b></div>
        <div><span className="lbl">Chance of a loss</span><b className="mono">{mc.lossChance.toFixed(0)}%</b></div>
      </div>
      <p className="small">Picking these trades again at random, the middle run ended at <b>{pct(mc.ret[1])}</b>. 1 in 20 runs did worse than <b>{pct(mc.ret[0])}</b>, and 1 in 20 did better than <b>{pct(mc.ret[2])}</b>. A typical run fell <b>{mc.ddPct[1].toFixed(1)}%</b> ({mc.ddR[1].toFixed(1)}R) from its high at some point, and <b>1 in 20 runs drew down {mc.ddPct[2].toFixed(1)}% ({mc.ddR[2].toFixed(1)}R)</b> or more. Even with the exact same trades in a different order, 1 in 20 orders drew down {mc.shuffleDdR95.toFixed(1)}R.</p>
      {mc.n >= 2 && <><h3 className="lbl">Range of equity paths <span className="dim">· middle line = typical, dashed = 1-in-20 bad and good</span></h3><div ref={el} className="btchart small" /></>}
      <p className="dim small">Resampling only reshuffles past trades; it can't show risks that never happened in this period.</p>
    </div>
  );
}
