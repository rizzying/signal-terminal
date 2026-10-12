import { useEffect, useRef } from "react";
import { createChart, CrosshairMode, LineStyle, type IChartApi, type ISeriesApi, type IPriceLine, type SeriesMarker, type Time } from "lightweight-charts";
import type { Candle } from "../engine/indicators";
import type { Analysis, Setup } from "../engine/scan";
import type { OIPoint } from "../api/positioning";

let cv: CanvasRenderingContext2D | null = null;
/** Resolve a CSS custom property (may be color-mix()) to an rgba() string the chart library can parse. */
const css = (v: string) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
  cv ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  if (!cv) return "#888";
  const probe = document.createElement("span"); probe.style.color = raw; document.body.appendChild(probe); const resolved = getComputedStyle(probe).color; probe.remove();
  cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#888"; cv.fillStyle = resolved; cv.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data; return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
};
export function Chart({ candles, analysis, setup, zone, theme, viewKey, oi }: { candles: Candle[]; analysis: Analysis | null; setup: Setup | null; zone: number; theme: string; viewKey: string; oi?: OIPoint[] | null }) {
  const oiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const el = useRef<HTMLDivElement>(null); const chart = useRef<IChartApi | null>(null); const series = useRef<ISeriesApi<"Candlestick"> | null>(null); const lines = useRef<IPriceLine[]>([]);
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, { autoSize: true, crosshair: { mode: CrosshairMode.Normal }, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } }, timeScale: { borderVisible: false, timeVisible: true, rightOffset: 6 } });
    series.current = c.addCandlestickSeries({ borderVisible: false }); chart.current = c;
    return () => { c.remove(); oiSeries.current = null; chart.current = null; series.current = null; lines.current = []; };
  }, []);
  useEffect(() => {
    const c = chart.current; if (!c) return; const ink2 = css("--ink-2"), line = css("--line-soft"), pos = css("--pos"), neg = css("--neg");
    c.applyOptions({ layout: { background: { color: "transparent" }, textColor: ink2, fontFamily: "Geist Mono Variable, ui-monospace, monospace", fontSize: 11 }, grid: { vertLines: { color: line }, horzLines: { color: line } } });
    series.current?.applyOptions({ upColor: pos, downColor: neg, wickUpColor: pos, wickDownColor: neg });
  }, [theme]);
  useEffect(() => {
    const s = series.current, c = chart.current; if (!s || !c) return;
    const px = candles.at(-1)?.c ?? 1; const prec = px >= 1000 ? 1 : px >= 10 ? 2 : px >= 1 ? 4 : 6;
    s.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });
    s.setData(candles.map((k) => ({ time: (k.t / 1000) as Time, open: k.o, high: k.h, low: k.l, close: k.c })));
    if (candles.length) { c.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 }); s.priceScale().applyOptions({ autoScale: true }); }
  }, [viewKey, candles]);
  useEffect(() => {
    const s = series.current; if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l)); lines.current = [];
    const add = (price: number, color: string, title: string, style = LineStyle.Solid) => lines.current.push(s.createPriceLine({ price, color, title, lineStyle: style, lineWidth: 1, axisLabelVisible: true }));
    const marks: SeriesMarker<Time>[] = [];
    if (analysis && candles.length) {
      const t = (i: number) => (candles[i].t / 1000) as Time; const from = candles.length - 150;
      for (const p of analysis.pivots) if (p.label && p.i >= from) marks.push({ time: t(p.i), position: p.kind === "high" ? "aboveBar" : "belowBar", color: css("--ink-3"), shape: "circle", size: 0, text: p.label });
      for (const b of analysis.breaks) if (b.i >= from) marks.push({ time: t(b.i), position: b.dir === "bull" ? "belowBar" : "aboveBar", color: css("--accent"), shape: b.dir === "bull" ? "arrowUp" : "arrowDown", text: b.choch ? "ChoCH" : "BoS" });
      marks.sort((a, b) => (a.time as number) - (b.time as number));
    }
    s.setMarkers(marks);
    const z = setup?.zones[zone];
    if (z) {
      const acc = css("--accent");
      add(z.top, acc, "Entry top", LineStyle.Dashed); add(z.entry, acc, "Entry median", LineStyle.Dotted); add(z.bottom, acc, "Entry bottom", LineStyle.Dashed);
      add(z.stop, css("--neg"), "Stop"); add(z.t1, css("--pos"), "TP1"); add(z.t2, css("--pos"), "TP2", LineStyle.Dotted);
    }
    if (analysis?.liq.length && setup) {
      const side = analysis.liq.map((b) => ({ p: b.price, v: b.long + b.short })).sort((a, b) => b.v - a.v).slice(0, 3);
      side.forEach((b) => add(b.p, css("--warn"), "est. liq", LineStyle.SparseDotted));
    }
  }, [analysis, setup, zone, theme, candles]);
  useEffect(() => {
    const c = chart.current; if (!c) return;
    if (!oi?.length) { if (oiSeries.current) { c.removeSeries(oiSeries.current); oiSeries.current = null; } return; }
    if (!oiSeries.current) { oiSeries.current = c.addLineSeries({ priceScaleId: "oi", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "OI" }); c.priceScale("oi").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false }); }
    oiSeries.current.applyOptions({ color: css("--accent") });
    const t0 = candles[0]?.t ?? 0; const seen = new Set<number>();
    oiSeries.current.setData(oi.filter((p) => p.t >= t0 && p.oiUsd > 0).map((p) => ({ time: (p.t / 1000) as Time, value: p.oiUsd })).filter((p) => !seen.has(p.time as number) && (seen.add(p.time as number), true)));
  }, [oi, theme, candles]);
  const reset = () => { const c = chart.current; if (!c || !candles.length) return; c.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 }); series.current?.priceScale().applyOptions({ autoScale: true }); };
  return <div className="chartwrap"><div ref={el} className="chart" aria-label="Candlestick chart" /><button className="btn ghost sm chart-reset" onClick={reset}>Reset view</button></div>;
}
