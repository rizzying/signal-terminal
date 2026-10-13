import { useVisibleInterval } from "./useVisibleInterval";
import { useEffect, useRef, useState } from "react";
import { baseAsset, bestSpread, fetchFunding, SKIPPED, to8h, toApr, type FundingResult } from "../api/funding";

const pct = (x: number, d = 4) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
const cls = (x: number) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
export function FundingPanel({ symbol }: { symbol: string }) {
  const [r, setR] = useState<FundingResult | null>(null); const [loading, setLoading] = useState(false); const [at, setAt] = useState<number | null>(null);
  const base = baseAsset(symbol);
  const gen = useRef(0);
  const load = () => { const g = gen.current; setLoading(true); fetchFunding(symbol).then((x) => { if (g === gen.current) { setR(x); setAt(Date.now()); } }).catch(() => {}).finally(() => g === gen.current && setLoading(false)); };
  useEffect(() => { gen.current++; setR(null); return () => { gen.current++; }; }, [base]);
  useVisibleInterval(load, 60_000, [base]);
  const sp = r ? bestSpread(r.rows) : null;
  return (
    <div className="card funding">
      <div className="cardhead"><h2>Funding · {base}</h2><span className="row gap"><span className="lbl">{at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " WIB" : ""}</span><button className="btn ghost sm" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></span></div>
      {sp && sp.aprSpread > 0 && <div className="arb" role="note">
        <span className="lbl">Biggest spread · idea only</span>
        <p><b>Short {sp.shortOn.venue}</b> ({pct(toApr(sp.shortOn), 1)} APR) / <b>Long {sp.longOn.venue}</b> ({pct(toApr(sp.longOn), 1)} APR)</p>
        <p className="mono">{(sp.aprSpread * 100).toFixed(1)}% APR · {(sp.spread8h * 100).toFixed(4)}% per 8h</p>
        <p className="dim small">Read-only. Ignores fees, basis, borrow, different funding times and caps, and rates change every hour. Not advice.</p>
      </div>}
      {r && r.rows.length > 0 ? <table className="rt ftable"><thead><tr><th>Venue</th><th>Current</th><th>Interval</th><th>Per 8h</th><th>APR</th><th>Predicted (8h)</th></tr></thead>
        <tbody>{r.rows.map((x) => <tr key={x.venue} className={sp && (x === sp.shortOn || x === sp.longOn) ? "hl" : ""}>
          <td data-label="Venue"><b>{x.venue}</b>{x.via && <span className="dim small"> · {x.via}</span>}</td>
          <td data-label="Current" className={`num ${cls(x.rate)}`}>{pct(x.rate)}</td>
          <td data-label="Interval" className="num">{x.intervalH}h</td>
          <td data-label="Per 8h" className={`num ${cls(x.rate)}`}>{pct(to8h(x))}</td>
          <td data-label="APR" className={`num ${cls(x.rate)}`}>{pct(toApr(x), 1)}</td>
          <td data-label="Predicted (8h)" className="num">{x.predicted != null && Number.isFinite(x.predicted) ? pct(to8h(x, x.predicted)) : "–"}</td>
        </tr>)}</tbody></table> : <p className="dim">{loading ? "Loading funding…" : "No venue lists this asset."}</p>}
      {r && <p className="dim small">Positive = longs pay shorts. {r.failed.length > 0 && <>Unavailable for {base}: {r.failed.map((f) => `${f.venue} (${f.reason})`).join(", ")}. </>}Not supported in the browser: {SKIPPED.map((s) => `${s.venue} (${s.reason})`).join(", ")}.</p>}
    </div>
  );
}
