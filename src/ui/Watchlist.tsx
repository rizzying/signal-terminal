import { useState } from "react";
import { candles, tfsFor, type Exchange, type TF } from "../api/markets";
import { fmt, scan, type Setup } from "../engine/scan";
import type { Settings } from "../engine/settings";

const DEF: Record<Exchange, string[]> = {
  hyperliquid: ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "HYPE", "SUI", "AVAX", "LINK", "ADA", "LTC", "AAVE", "ENA", "TON", "DOT", "NEAR", "APT", "ARB", "OP"],
  bulk: ["BTC-USD", "ETH-USD", "SOL-USD"],
  binance: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "SUIUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT", "NEARUSDT", "AAVEUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "TONUSDT", "ENAUSDT"],
};
type Row = { symbol: string; best?: Setup; err?: string };
const key = (ex: Exchange) => `sig.watch.${ex}`;
export function Watchlist({ settings, onOpen }: { settings: Settings; onOpen: (ex: Exchange, sym: string, tf: TF) => void }) {
  const [ex, setEx] = useState<Exchange>(() => (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid");
  const [tf, setTf] = useState<TF>("4h");
  const [list, setList] = useState<string>(() => localStorage.getItem(key(ex)) ?? DEF[ex].join(", "));
  const [rows, setRows] = useState<Row[] | null>(null); const [prog, setProg] = useState<string | null>(null);
  const switchEx = (e: Exchange) => { setEx(e); setList(localStorage.getItem(key(e)) ?? DEF[e].join(", ")); setRows(null); };
  async function run() {
    const syms = [...new Set(list.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 20); localStorage.setItem(key(ex), syms.join(", "));
    const out: Row[] = []; let n = 0; setProg(`0/${syms.length}`);
    await Promise.all(syms.map(async (symbol) => {
      try { const c = await candles(ex, symbol, tf, 400); const L = scan(c, "long", settings), S = scan(c, "short", settings);
        const score = (x: Setup) => (x.shown ? 1000 : 0) + x.confidence + Math.max(...x.zones.map((z) => z.rr1));
        out.push({ symbol, best: score(L) >= score(S) ? L : S }); }
      catch (e: any) { out.push({ symbol, err: e.message ?? "failed" }); }
      setProg(`${++n}/${syms.length}`);
    }));
    const sc = (r: Row) => r.best ? (r.best.shown ? 1000 : 0) + r.best.confidence * 10 + Math.max(...r.best.zones.map((z) => z.rr1)) : -1;
    setRows(out.sort((a, b) => sc(b) - sc(a))); setProg(null);
  }
  return (
    <section className="stack rise">
      <div className="card">
        <div className="cardhead"><h2>Watchlist scanner</h2><span className="lbl">up to 20 symbols</span></div>
        <div className="row wrap gap" style={{ marginBottom: 12 }}>
          <div className="seg" role="tablist" aria-label="Exchange">{(["hyperliquid", "bulk", "binance"] as Exchange[]).map((e) => <button key={e} role="tab" aria-selected={ex === e} className={ex === e ? "on" : ""} onClick={() => switchEx(e)}>{e === "hyperliquid" ? "Hyperliquid" : e === "bulk" ? "Bulk" : "Binance"}</button>)}</div>
          <div className="seg" role="tablist" aria-label="Timeframe">{tfsFor(ex).map((t) => <button key={t} role="tab" aria-selected={tf === t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t.toUpperCase()}</button>)}</div>
        </div>
        <label className="lbl" htmlFor="wl">Symbols (comma separated, exchange format)</label>
        <textarea id="wl" className="input" style={{ width: "100%", marginTop: 4 }} rows={2} value={list} onChange={(e) => setList(e.target.value)} />
        <div className="row gap" style={{ marginTop: 12 }}><button className="btn primary" disabled={!!prog} onClick={run}>{prog ? `Scanning ${prog}…` : "Scan watchlist"}</button><span className="dim small">Ranks by: setup rule met, then confidence, then best R:R.</span></div>
      </div>
      {rows && <div className="card"><table className="rt"><thead><tr><th>Symbol</th><th>Side</th><th>Setup</th><th>Confidence</th><th>Best R:R</th><th>Zone 1</th><th></th></tr></thead><tbody>
        {rows.map((r) => { const b = r.best; const bz = b ? b.zones.reduce((a, z) => (z.rr1 > a.rr1 ? z : a)) : null;
          return <tr key={r.symbol}><td data-label="Symbol"><b>{r.symbol}</b></td>
            {b ? <><td data-label="Side"><span className={`badge ${b.dir}`}>{b.dir}</span></td><td data-label="Setup">{b.shown ? "Rule met" : <span className="dim">No</span>}</td>
              <td data-label="Confidence" className="num">{b.band} · {b.confidence}%</td><td data-label="Best R:R" className="num">{bz!.rr1.toFixed(1)}R (Z{bz!.rank})</td>
              <td data-label="Zone 1" className="num">{fmt(b.zones[0].bottom)}–{fmt(b.zones[0].top)}</td></> : <td data-label="Error" colSpan={5} className="dim">{r.err}</td>}
            <td data-label=""><button className="btn ghost sm" onClick={() => onOpen(ex, r.symbol, tf)}>Open</button></td></tr>; })}
      </tbody></table><p className="dim small">Confidence = signals agreeing, not win chance.</p></div>}
    </section>
  );
}
