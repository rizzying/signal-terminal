import { useVisibleInterval } from "./useVisibleInterval";
import { useEffect, useRef, useState } from "react";
import { baseAsset } from "../api/funding";
import { longShort, oiChange, recentLiqs, type Liq, type LS, type OIPoint } from "../api/positioning";
import { fmt } from "../engine/scan";

const usd = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : `$${x.toFixed(0)}`);
const pct = (x: number | null) => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
const time = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export function PositioningPanel({ symbol, oi }: { symbol: string; oi: OIPoint[] | null }) {
  const base = baseAsset(symbol); const [ls, setLs] = useState<LS[] | null>(null); const [lq, setLq] = useState<{ liqs: Liq[]; failed: string[] } | null>(null);
  const gen = useRef(0);
  const load = () => { const g = gen.current; longShort(base).then((x) => g === gen.current && setLs(x)).catch(() => {}); recentLiqs(base).then((x) => g === gen.current && setLq(x)).catch(() => {}); };
  useEffect(() => { gen.current++; setLs(null); setLq(null); return () => { gen.current++; }; }, [base]);
  useVisibleInterval(load, 60_000, [base]);
  const last = oi?.at(-1); const day = oi && oi.length > 1 ? Math.round(8.64e7 / (oi[1].t - oi[0].t)) : 0;
  const longUsd = lq?.liqs.filter((l) => l.side === "long").reduce((a, l) => a + l.usd, 0) ?? 0, shortUsd = lq?.liqs.filter((l) => l.side === "short").reduce((a, l) => a + l.usd, 0) ?? 0;
  return (
    <div className="card positioning">
      <div className="cardhead"><h2>Positioning · {base}</h2><span className="lbl">public data · read-only</span></div>
      <div className="pgrid">
        <div className="stat"><span className="lbl">Open interest (Gate)</span><b className="mono" data-smoke="oi">{last ? usd(last.oiUsd) : "–"}</b><span className="mono small dim">24h {pct(day ? oiChange(oi!, day) : null)} · last bar {pct(oi ? oiChange(oi, 1) : null)}</span></div>
        {(ls ?? []).map((x) => <div className="stat" key={x.venue}><span className="lbl">Long/short accounts ({x.venue})</span><b className="mono">{x.ratio.toFixed(2)}</b>
          <div className="lsbar" aria-hidden="true"><div style={{ width: `${x.longPct * 100}%` }} /></div><span className="mono small dim">{Math.round(x.longPct * 100)}% long{x.prev ? ` · was ${x.prev.toFixed(2)}` : ""}</span></div>)}
        {ls && !ls.length && <div className="stat dim small">Long/short ratio not available for {base}.</div>}
      </div>
      <h3 className="lbl" style={{ marginTop: 20 }}>Recent liquidations (Gate + OKX)</h3>
      {lq && <p className="mono small">Longs liquidated {usd(longUsd)} · shorts liquidated {usd(shortUsd)}{lq.failed.length ? <span className="dim"> · unavailable: {lq.failed.join(", ")}</span> : null}</p>}
      {lq?.liqs.length ? <ul className="liqs">{lq.liqs.slice(0, 12).map((l, i) => <li key={i}><span className="mono dim">{time(l.t)}</span><span className={`badge ${l.side}`}>{l.side}</span><span className="mono">{fmt(l.px)}</span><span className="mono">{usd(l.usd)}</span><span className="dim small">{l.venue}</span></li>)}</ul> : <p className="dim small">{lq ? "No recent liquidations." : "Loading…"}</p>}
      <p className="dim small">“Long liquidated” = a long position was force-closed. Times in WIB. OI and ratios are from single exchanges, not the whole market.</p>
    </div>
  );
}
