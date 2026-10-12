import { useEffect, useMemo, useState } from "react";
import { walletFills } from "../api/markets";
import { fmt } from "../engine/scan";
import { computePnl, computeR, db, EMOTIONS, exportJson, importJson, uid, type Trade } from "../journal/db";
import { binanceCsvToTrades, fillsToTrades } from "../journal/imports";
import { stats, type Row } from "../journal/stats";

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
export function JournalView({ prefill, clearPrefill }: { prefill: Trade | null; clearPrefill: () => void }) {
  const [trades, setTrades] = useState<Trade[]>([]); const [edit, setEdit] = useState<Trade | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [wallet, setWallet] = useState(""); const [wex, setWex] = useState<"hyperliquid" | "bulk">("hyperliquid"); const [busy, setBusy] = useState(false);
  const reload = () => db.trades().then(setTrades);
  useEffect(() => { reload(); }, []);
  useEffect(() => { if (prefill) { setEdit(prefill); clearPrefill(); } }, [prefill]);
  const st = useMemo(() => stats(trades), [trades]);
  const save = async (t: Trade) => { const pnl = t.pnl ?? computePnl(t); await db.put({ ...t, pnl, r: computeR(t) }); setEdit(null); reload(); };
  async function importWallet() {
    const a = wallet.trim(); if (!a) return; setBusy(true); setMsg(null);
    try { const ts = fillsToTrades(await walletFills(wex, a), wex); const have = new Set(trades.map((t) => t.extId)); const fresh = ts.filter((t) => !have.has(t.extId)); await db.putMany(fresh); setMsg(`Imported ${fresh.length} closed trade${fresh.length === 1 ? "" : "s"} (${ts.length - fresh.length} already in journal).`); reload(); }
    catch (e: any) { setMsg(`Import failed: ${e.message ?? e}`); } finally { setBusy(false); }
  }
  async function file(f: File | undefined, kind: "csv" | "json") {
    if (!f) return; setMsg(null);
    try {
      const text = await f.text();
      if (kind === "json") { const n = await importJson(text); setMsg(`Restored ${n} trades from backup.`); }
      else { const ts = binanceCsvToTrades(text); const have = new Set(trades.map((t) => t.extId)); const fresh = ts.filter((t) => !have.has(t.extId)); await db.putMany(fresh); setMsg(`Imported ${fresh.length} Binance trades.`); }
      reload();
    } catch (e: any) { setMsg(`Import failed: ${e.message ?? e}`); }
  }
  async function exp() { const b = new Blob([await exportJson()], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `signal-journal-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  return (
    <section className="stack rise">
      <div className="card">
        <div className="cardhead"><h2>Journal</h2><span className="lbl">stored on this device only</span></div>
        <div className="row wrap gap"><button className="btn primary" onClick={() => setEdit(blank())}>New trade</button><button className="btn" onClick={exp}>Export backup</button>
          <label className="btn">Restore backup<input type="file" accept="application/json,.json" hidden onChange={(e) => file(e.target.files?.[0], "json")} /></label>
          <label className="btn">Binance CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => file(e.target.files?.[0], "csv")} /></label></div>
        <form className="row wrap gap" onSubmit={(e) => { e.preventDefault(); importWallet(); }} style={{ marginTop: 12 }}>
          <select className="input" aria-label="Wallet exchange" value={wex} onChange={(e) => setWex(e.target.value as any)}><option value="hyperliquid">Hyperliquid</option><option value="bulk">Bulk</option></select>
          <input className="input grow" aria-label="Public wallet address" placeholder="Public wallet address (no keys)" value={wallet} onChange={(e) => setWallet(e.target.value)} />
          <button className="btn" disabled={busy}>{busy ? "Importing…" : "Import fills"}</button>
        </form>
        {msg && <p className="note" role="status">{msg}</p>}
      </div>
      {edit && <TradeForm t={edit} onSave={save} onCancel={() => setEdit(null)} />}
      <div className="card">
        <div className="cardhead"><h2>Trades</h2><span className="mono dim">{trades.length}</span></div>
        {trades.length ? <table className="rt"><thead><tr><th>Symbol</th><th>Side</th><th>Entry</th><th>Exit</th><th>Size</th><th>P&L</th><th>R</th><th>Conf.</th><th>Date</th><th></th></tr></thead>
          <tbody>{trades.map((t) => <tr key={t.id}>
            <td data-label="Symbol">{t.symbol}</td><td data-label="Side"><span className={`badge ${t.side}`}>{t.side.toUpperCase()}</span></td>
            <td data-label="Entry" className="num">{fmt(t.entry)}</td><td data-label="Exit" className="num">{t.exit != null ? fmt(t.exit) : "open"}</td><td data-label="Size" className="num">{fmt(t.size)}</td>
            <td data-label="P&L" className={`num ${(t.pnl ?? 0) > 0 ? "pos" : (t.pnl ?? 0) < 0 ? "neg" : ""}`}>{t.pnl != null ? (t.pnl > 0 ? "+" : "") + fmt(t.pnl) : "–"}</td>
            <td data-label="R" className="num">{t.r != null ? t.r.toFixed(2) : "–"}</td><td data-label="Conf." className="num">{t.confidence != null ? `P${t.confidence}` : "–"}</td>
            <td data-label="Date" className="num">{new Date(t.createdAt).toLocaleDateString("en-GB")}</td>
            <td data-label=""><span className="row gap"><button className="btn ghost sm" onClick={() => setEdit(t)}>Edit</button><button className="btn ghost sm" onClick={async () => { if (confirm("Delete this trade from this device?")) { await db.del(t.id); reload(); } }}>Delete</button></span></td>
          </tr>)}</tbody></table> : <p className="dim">No trades yet. Scan a setup and tap “Journal”, add one manually, or import.</p>}
      </div>
      <div className="card"><div className="cardhead"><h2>Stats</h2><span className="lbl">closed trades</span></div>
        <div className="statgrid"><StatTable title="Overall" rows={st.overall} /><StatTable title="By signal" rows={st.bySignal} /><StatTable title="By confidence band" rows={st.byConfidence} /><StatTable title="By emotion" rows={st.byEmotion} /><StatTable title="Plan followed" rows={st.byPlan} /></div>
      </div>
    </section>
  );
}
const blank = (): Trade => ({ id: uid(), createdAt: Date.now(), exchange: "", symbol: "", side: "long", entry: 0, size: 0, signals: [], source: "manual" });
function StatTable({ title, rows }: { title: string; rows: Row[] }) {
  return <div><h3 className="lbl">{title}</h3>{rows.length ? <table className="mini"><tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td className="num">{r.n}</td><td className="num">{Math.round(r.winRate * 100)}%</td><td className="num">{r.avgR != null ? `${r.avgR.toFixed(2)}R` : "–"}</td></tr>)}</tbody></table> : <p className="dim small">No data</p>}</div>;
}
function TradeForm({ t, onSave, onCancel }: { t: Trade; onSave: (t: Trade) => void; onCancel: () => void }) {
  const [f, setF] = useState<Trade>(t); const set = (p: Partial<Trade>) => setF({ ...f, ...p });
  const shot = async (file?: File) => { if (!file) return; if (file.size > 3e6) return alert("Screenshot is over 3 MB; please crop it."); const r = new FileReader(); r.onload = () => set({ screenshot: String(r.result) }); r.readAsDataURL(file); };
  return (
    <form className="card form rise" onSubmit={(e) => { e.preventDefault(); if (!f.symbol || !(f.entry > 0)) return alert("Symbol and entry are required."); onSave(f); }}>
      <div className="cardhead"><h2>{t.source === "scan" ? "Journal scan" : "Trade"}</h2>{f.confidence != null && <span className="badge">P{f.confidence} · Zone {f.zone}</span>}</div>
      <div className="formgrid">
        <label>Symbol<input className="input" value={f.symbol} onChange={(e) => set({ symbol: e.target.value })} /></label>
        <label>Side<select className="input" value={f.side} onChange={(e) => set({ side: e.target.value as any })}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label>Entry<input className="input" type="number" step="any" value={f.entry || ""} onChange={(e) => set({ entry: +e.target.value })} /></label>
        <label>Stop<input className="input" type="number" step="any" value={f.stop ?? ""} onChange={(e) => set({ stop: num(e.target.value) })} /></label>
        <label>Exit<input className="input" type="number" step="any" value={f.exit ?? ""} onChange={(e) => set({ exit: num(e.target.value), pnl: undefined })} /></label>
        <label>Size<input className="input" type="number" step="any" value={f.size || ""} onChange={(e) => set({ size: +e.target.value })} /></label>
        <label>P&L (blank = auto)<input className="input" type="number" step="any" value={f.pnl ?? ""} onChange={(e) => set({ pnl: num(e.target.value) })} /></label>
        <label>Emotion<select className="input" value={f.emotion ?? ""} onChange={(e) => set({ emotion: (e.target.value || undefined) as any })}><option value="">—</option>{EMOTIONS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={!!f.followedPlan} onChange={(e) => set({ followedPlan: e.target.checked })} />Followed my plan?</label>
        <label className="full">Signals that fired (comma separated)<input className="input" value={f.signals.join(", ")} onChange={(e) => set({ signals: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></label>
        <label className="full">Notes<textarea className="input" rows={3} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></label>
        <label className="full">Screenshot (stays on this device)<input type="file" accept="image/*" onChange={(e) => shot(e.target.files?.[0])} /></label>
        {f.screenshot && <img className="full shot" src={f.screenshot} alt="Trade screenshot" />}
        {f.settings && <details className="full"><summary className="dim small">Strategy settings used ({Object.keys(f.settings).length} params, saved with this trade)</summary><pre className="mono small">{JSON.stringify(f.settings, null, 1)}</pre></details>}
      </div>
      <div className="row gap"><button className="btn primary">Save</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}
