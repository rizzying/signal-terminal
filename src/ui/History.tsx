import { useEffect, useState } from "react";
import type { Candle } from "../engine/indicators";
import { whatHappened, type HistStats } from "../engine/history";
import type { Settings } from "../engine/settings";

export function HistoryPanel({ candles, settings, label }: { candles: Candle[]; settings: Settings; label: string }) {
  const [st, setSt] = useState<HistStats[] | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => setSt(null), [label, settings]);
  const run = async () => { setBusy(true); try { setSt(await Promise.all([whatHappened(candles, "long", settings), whatHappened(candles, "short", settings)])); } finally { setBusy(false); } };
  return (
    <div className="card history">
      <div className="cardhead"><h2>What happened next</h2><span className="lbl">{label}</span></div>
      <p className="dim small">Replays your current settings over the {candles.length} loaded candles. Each time the setup rule was met: did price reach Zone 1, and then hit TP1 or the stop first?</p>
      {!st && <button className="btn" disabled={busy || candles.length < 130} onClick={run}>{busy ? "Replaying…" : "Run replay"}</button>}
      {st && <table className="rt"><thead><tr><th>Side</th><th>Setups</th><th>Filled</th><th>TP1 first</th><th>Stop first</th><th>Hit rate</th><th>Avg R:R</th><th>Result per trade</th></tr></thead><tbody>
        {st.map((x) => <tr key={x.dir}><td data-label="Side"><span className={`badge ${x.dir}`}>{x.dir}</span></td><td data-label="Setups" className="num">{x.setups}</td><td data-label="Filled" className="num">{x.filled}</td>
          <td data-label="TP1 first" className="num">{x.tp1}</td><td data-label="Stop first" className="num">{x.stopped}</td>
          <td data-label="Hit rate" className="num">{x.hitRate == null ? "–" : `${Math.round(x.hitRate * 100)}%`}</td><td data-label="Avg R:R" className="num">{x.avgRR == null ? "–" : `${x.avgRR.toFixed(1)}R`}</td>
          <td data-label="Result per trade" className={`num ${x.expR == null ? "" : x.expR > 0 ? "pos" : "neg"}`}>{x.expR == null ? "–" : `${x.expR >= 0 ? "+" : "−"}${Math.abs(x.expR).toFixed(2)}R`}</td></tr>)}
      </tbody></table>}
      {st && <p className="dim small">Small samples swing a lot, so under ~30 trades treat this as a rough hint. It ignores fees, slippage and funding, and the past doesn't guarantee the future. <button className="btn ghost sm" onClick={run} disabled={busy}>Run again</button></p>}
    </div>
  );
}
