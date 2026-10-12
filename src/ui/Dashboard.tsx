import { useMemo } from "react";
import { fmt } from "../engine/scan";
import type { Trade } from "../journal/db";
import { dashboard } from "../journal/dash";
import type { Row } from "../journal/stats";

function Curve({ pts }: { pts: { t: number; v: number }[] }) {
  if (pts.length < 2) return <p className="dim small">Add at least 2 closed trades to see the equity curve.</p>;
  const W = 600, H = 160, xs = pts.map((_, i) => (i / (pts.length - 1)) * W); const vs = [0, ...pts.map((p) => p.v)]; const lo = Math.min(...vs), hi = Math.max(...vs); const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 8) - 4;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return <svg className="curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Equity curve, ${pts.length} trades, ending at ${fmt(pts.at(-1)!.v)}`}>
    <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" /><path d={d} className={pts.at(-1)!.v >= 0 ? "up" : "down"} vectorEffect="non-scaling-stroke" /></svg>;
}
function Bars({ title, rows }: { title: string; rows: Row[] }) {
  return <div><h3 className="lbl">{title}</h3>{rows.length ? <ul className="bars">{rows.map((r) => <li key={r.key}><span>{r.key}</span><div className="bar" aria-hidden="true"><div style={{ width: `${r.winRate * 100}%` }} /></div><span className="mono small">{Math.round(r.winRate * 100)}% · {r.n}{r.avgR != null ? ` · ${r.avgR.toFixed(2)}R` : ""}</span></li>)}</ul> : <p className="dim small">No data</p>}</div>;
}
export function Dashboard({ trades }: { trades: Trade[] }) {
  const d = useMemo(() => dashboard(trades), [trades]);
  const sign = (x: number) => `${x >= 0 ? "+" : "−"}${fmt(Math.abs(x))}`;
  return (
    <div className="card dash">
      <div className="cardhead"><h2>Dashboard</h2><span className="lbl">this device only · times WIB</span></div>
      <div className="pgrid" style={{ marginBottom: 16 }}>
        <div className="stat"><span className="lbl">Total P&L</span><b className={`mono ${d.total >= 0 ? "pos" : "neg"}`}>{sign(d.total)}</b></div>
        <div className="stat"><span className="lbl">Win rate</span><b className="mono">{d.winRate == null ? "–" : `${Math.round(d.winRate * 100)}%`}</b><span className="small dim">{d.n} closed trades</span></div>
        <div className="stat"><span className="lbl">Profit factor</span><b className="mono">{d.profitFactor == null ? "–" : d.profitFactor.toFixed(2)}</b><span className="small dim">wins ÷ losses</span></div>
        <div className="stat"><span className="lbl">Worst drawdown</span><b className="mono neg">{d.maxDD ? sign(d.maxDD) : "–"}</b></div>
      </div>
      <Curve pts={d.curve} />
      <div className="statgrid" style={{ marginTop: 16 }}><Bars title="By setup" rows={d.bySetup} /><Bars title="By time of day (WIB)" rows={d.byHour} /><Bars title="By weekday" rows={d.byWeekday} /></div>
      {d.biggestLosses.length > 0 && <><h3 className="lbl" style={{ marginTop: 16 }}>Biggest losses</h3><ul className="alerts">{d.biggestLosses.map((t) => <li key={t.id}><span><b>{t.symbol}</b> <span className="dim">{t.side} · {new Date(t.createdAt).toLocaleDateString("en-GB")}{t.emotion ? ` · ${t.emotion}` : ""}{t.followedPlan === false ? " · broke plan" : ""}</span></span><span className="mono neg">{sign(t.pnl!)}</span></li>)}</ul></>}
    </div>
  );
}
