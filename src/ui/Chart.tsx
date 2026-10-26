import { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type IPriceLine, type SeriesMarker, type Time } from "lightweight-charts";
import type { Candle } from "../engine/indicators";
import type { Analysis, Setup } from "../engine/scan";
import type { OIPoint } from "../api/positioning";
import { elliottOverlay } from "../engine/elliott";
import { declutter, lineSpecs, PriceLines } from "./chartLines";

let cv: CanvasRenderingContext2D | null = null;
/** Resolve a CSS custom property (may be color-mix()) to an rgba() string the chart library can parse. */
export const css = (v: string) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
  cv ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  if (!cv) return "#888";
  const probe = document.createElement("span"); probe.style.color = raw; document.body.appendChild(probe); const resolved = getComputedStyle(probe).color; probe.remove();
  cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#888"; cv.fillStyle = resolved; cv.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data; return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
};
export function Chart({ onPickPrice, candles, analysis, setup, zone, theme, viewKey, oi, live, yourLiq = null }: { onPickPrice?: (price: number) => void; yourLiq?: number | null; live?: Candle | null; candles: Candle[]; analysis: Analysis | null; setup: Setup | null; zone: number; theme: string; viewKey: string; oi?: OIPoint[] | null }) {
  const oiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const pickRef = useRef(onPickPrice); pickRef.current = onPickPrice;
  const el = useRef<HTMLDivElement>(null); const chart = useRef<IChartApi | null>(null); const series = useRef<ISeriesApi<"Candlestick"> | null>(null); const lines = useRef<PriceLines<IPriceLine> | null>(null); const [ready, setReady] = useState(0);
  const [ewFound, setEwFound] = useState(true); const [ew, setEw] = useState(() => localStorage.getItem("sig.ew") === "1"); // experimental, display only, off by default
  useEffect(() => { localStorage.setItem("sig.ew", ew ? "1" : "0"); }, [ew]);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, { autoSize: true, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } }, timeScale: { borderVisible: false, timeVisible: true, rightOffset: 6 } });
    series.current = c.addCandlestickSeries({ borderVisible: false }); chart.current = c; lines.current = new PriceLines(series.current); setReady((n) => n + 1);
    return () => { c.remove(); oiSeries.current = null; chart.current = null; series.current = null; lines.current = null; };
  }, []);
  useEffect(() => { const c = chart.current; if (!c) return; const h = (p: { point?: { x: number; y: number } }) => { if (!p.point || !series.current) return; const v = series.current.coordinateToPrice(p.point.y); if (v != null) pickRef.current?.(v as number); }; c.subscribeClick(h); return () => { try { c.unsubscribeClick(h); } catch { /* chart gone */ } }; }, [ready]);
  useEffect(() => {
    // read theme colours on the next frame, after <html class="dark"> has been updated
    const id = requestAnimationFrame(() => applyTheme()); applyTheme(); return () => cancelAnimationFrame(id);
  }, [theme, ready]);
  function applyTheme() {
    const c = chart.current; if (!c) return; const ink2 = css("--ink-2"), line = css("--line-soft"), pos = css("--pos"), neg = css("--neg");
    c.applyOptions({ layout: { background: { color: "transparent" }, textColor: ink2, fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace", fontSize: 12 }, grid: { vertLines: { color: line }, horzLines: { color: line } } }); if (el.current) el.current.dataset.grid = line;
    series.current?.applyOptions({ upColor: pos, downColor: neg, wickUpColor: pos, wickDownColor: neg });
    drawLines();
  }
  useEffect(() => {
    const s = series.current, c = chart.current; if (!s || !c) return;
    const px = candles.at(-1)?.c ?? 1; const prec = px >= 1000 ? 1 : px >= 10 ? 2 : px >= 1 ? 4 : 6;
    s.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });
    s.setData(candles.map((k) => ({ time: (k.t / 1000) as Time, open: k.o, high: k.h, low: k.l, close: k.c })));
    if (candles.length) { c.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 }); s.priceScale().applyOptions({ autoScale: true }); }
  }, [viewKey, candles]);
  useEffect(() => { // live tick: update/append only the forming candle (no re-scan)
    const s = series.current; const last = candles.at(-1); if (!s || !live || !last || live.t < last.t) return;
    try { s.update({ time: (live.t / 1000) as Time, open: live.o, high: live.h, low: live.l, close: live.c }); } catch { /* out-of-order tick */ }
  }, [live, candles]);
  const drawRef = useRef<(force?: boolean) => void>(() => {});
  useEffect(() => { // re-check label collisions after zoom/pan/resize (axis scale changes); only redraws when labels change
    const c = chart.current; if (!c) return; let raf = 0; const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => drawRef.current(false)); };
    c.timeScale().subscribeVisibleLogicalRangeChange(f); const ro = new ResizeObserver(f); if (el.current) ro.observe(el.current); f();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); try { c.timeScale().unsubscribeVisibleLogicalRangeChange(f); } catch { /* removed */ } };
  }, [ready]);
  drawRef.current = (force?: boolean) => drawLines(force);
  function drawLines(force = true) { const sp = lineSpecs(setup, zone, analysis, { accent: css("--chart"), neg: css("--neg"), pos: css("--pos"), warn: css("--ink-3") }, yourLiq); const s = series.current; lines.current?.sync(s ? declutter(sp, (p) => s.priceToCoordinate(p)) : sp, force); if (el.current) el.current.dataset.lines = String(lines.current?.count ?? 0); }
  useEffect(() => {
    const s = series.current; if (!s) return;
    drawLines();
    const marks: SeriesMarker<Time>[] = [];
    if (analysis && candles.length) {
      const t = (i: number) => (candles[i].t / 1000) as Time; const from = candles.length - 150;
      for (const p of analysis.pivots) if (p.label && p.i >= from) marks.push({ time: t(p.i), position: p.kind === "high" ? "aboveBar" : "belowBar", color: css("--ink-3"), shape: "circle", size: 0, text: p.label });
      for (const b of analysis.breaks) if (b.i >= from) marks.push({ time: t(b.i), position: b.dir === "bull" ? "belowBar" : "aboveBar", color: css("--chart"), shape: b.dir === "bull" ? "arrowUp" : "arrowDown", text: b.choch ? "ChoCH" : "BoS" });
      if (ew) { const f = elliottOverlay(candles); setEwFound(!!f); if (f) for (const l of f.labels) marks.push({ time: t(l.i), position: l.kind === "high" ? "aboveBar" : "belowBar", color: css("--warn-ew"), shape: "square", size: 0, text: `(${l.text})` }); }
      marks.sort((a, b) => (a.time as number) - (b.time as number));
    }
    s.setMarkers(marks);
  }, [analysis, setup, zone, theme, candles, viewKey, ready, yourLiq, ew]);
  useEffect(() => {
    const c = chart.current; if (!c) return;
    if (!oi?.length) { if (oiSeries.current) { c.removeSeries(oiSeries.current); oiSeries.current = null; } return; }
    if (!oiSeries.current) { oiSeries.current = c.addLineSeries({ priceScaleId: "oi", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "OI" }); c.priceScale("oi").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false }); }
    oiSeries.current.applyOptions({ color: css("--chart") });
    const t0 = candles[0]?.t ?? 0; const seen = new Set<number>();
    oiSeries.current.setData(oi.filter((p) => p.t >= t0 && p.oiUsd > 0).map((p) => ({ time: (p.t / 1000) as Time, value: p.oiUsd })).filter((p) => !seen.has(p.time as number) && (seen.add(p.time as number), true)));
  }, [oi, theme, candles]);
  const reset = () => { const c = chart.current; if (!c || !candles.length) return; c.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 }); series.current?.priceScale().applyOptions({ autoScale: true }); };
  return <div className="chartwrap"><div ref={el} className="chart" aria-label="Candlestick chart" /><button className="btn ghost sm chart-reset" onClick={reset}>Reset view</button><label className="btn ghost sm chart-ew"><input type="checkbox" checked={ew} onChange={(e) => setEw(e.target.checked)} /> Elliott Wave (experimental)</label>{ew && <div className="chart-ew-note small">{ewFound ? "One possible count, not a signal" : "No count fits the rules right now · experimental"}</div>}</div>;
}
