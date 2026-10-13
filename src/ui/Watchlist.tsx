import { useEffect, useRef, useState } from "react";
import { useVisibleInterval } from "./useVisibleInterval";
import { candles, marketsCached, tfsFor, type Exchange, type TF } from "../api/markets";
import { fmt, MIN_CANDLES, scan, type Setup } from "../engine/scan";
import type { Settings } from "../engine/settings";

const DEF: Record<Exchange, string[]> = {
  hyperliquid: ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "HYPE", "SUI", "AVAX", "LINK", "ADA", "LTC", "AAVE", "ENA", "TON", "DOT", "NEAR", "APT", "ARB", "OP"],
  bulk: [], // filled from Bulk's live exchangeInfo (all TRADING markets)
  binance: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "SUIUSDT", "TRXUSDT", "LTCUSDT", "DOTUSDT", "NEARUSDT", "AAVEUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "TONUSDT", "ENAUSDT"],
};
type Row = { symbol: string; best?: Setup; err?: string; isNew?: boolean };
/** Last watchlist results per exchange (Today screen reads this). */
export type WatchSnap = { at: number; ex: Exchange; tf: TF; rows: { symbol: string; dir?: string; shown?: boolean; confidence?: number; band?: string; isNew?: boolean; err?: string }[] };
export const SNAP = (ex: Exchange) => `sig.watch.last.${ex}`;
export const loadSnap = (ex: Exchange): WatchSnap | null => { try { return JSON.parse(localStorage.getItem(SNAP(ex)) || "null"); } catch { return null; } };
const OLD_BULK_DEFAULT = "BTC-USD, ETH-USD, SOL-USD";
const EVERY = [0, 1, 5, 15, 30];
const key = (ex: Exchange) => `sig.watch.${ex}`;
export function Watchlist({ settings, onOpen }: { settings: Settings; onOpen: (ex: Exchange, sym: string, tf: TF) => void }) {
  const [ex, setEx] = useState<Exchange>(() => (localStorage.getItem("sig.ex") as Exchange) || "hyperliquid");
  const [tf, setTf] = useState<TF>("4h");
  const saved = (e: Exchange) => { const v = localStorage.getItem(key(e)); return e === "bulk" && v === OLD_BULK_DEFAULT ? null : v; };
  const [list, setList] = useState<string>(() => saved(ex) ?? DEF[ex].join(", "));
  const [every, setEvery] = useState<number>(() => { const v = Number(localStorage.getItem("sig.watch.every") ?? 5); return EVERY.includes(v) ? v : 5; });
  const [at, setAt] = useState<number | null>(null); const prevShown = useRef<Set<string> | null>(null); const busy = useRef(false);
  useEffect(() => { if (ex !== "bulk" || saved("bulk")) return; let live = true; marketsCached("bulk").then((m) => live && setList(m.map((x) => x.symbol).join(", "))).catch(() => {}); return () => { live = false; }; }, [ex]);
  useEffect(() => { prevShown.current = null; }, [ex, tf]);
  const [rows, setRows] = useState<Row[] | null>(null); const [prog, setProg] = useState<string | null>(null);
  const switchEx = (e: Exchange) => { setEx(e); setList(saved(e) ?? DEF[e].join(", ")); setRows(null); setAt(null); };
  async function run() {
    if (busy.current) return; busy.current = true; try {
    const syms = [...new Set(list.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 20); localStorage.setItem(key(ex), syms.join(", "));
    const out: Row[] = []; let n = 0; setProg(`0/${syms.length}`);
    await Promise.all(syms.map(async (symbol) => {
      try { const c = await candles(ex, symbol, tf, 400); if (c.length < MIN_CANDLES) throw new Error(c.length ? `Only ${c.length} candles on ${tf}` : `No candles: not listed on this exchange?`); const L = scan(c, "long", settings), S = scan(c, "short", settings);
        const score = (x: Setup) => (x.shown ? 1000 : 0) + x.confidence + Math.max(...x.zones.map((z) => z.rr1));
        out.push({ symbol, best: score(L) >= score(S) ? L : S }); }
      catch (e: any) { out.push({ symbol, err: e.message ?? "failed" }); }
      setProg(`${++n}/${syms.length}`);
    }));
        const sc = (r: Row) => r.best ? (r.best.shown ? 1000 : 0) + r.best.confidence * 10 + Math.max(...r.best.zones.map((z) => z.rr1)) : -1;
    // "New" = meets the rule now but didn't at the previous refresh (same exchange and timeframe)
    const now = new Set(out.filter((r) => r.best?.shown).map((r) => `${r.symbol}|${r.best!.dir}`));
    if (prevShown.current) for (const r of out) if (r.best?.shown && !prevShown.current.has(`${r.symbol}|${r.best.dir}`)) r.isNew = true;
    prevShown.current = now; const sorted = out.sort((a, b) => sc(b) - sc(a)); setRows(sorted); setProg(null); setAt(Date.now());
    const snap: WatchSnap = { at: Date.now(), ex, tf, rows: sorted.map((r) => ({ symbol: r.symbol, dir: r.best?.dir, shown: r.best?.shown, confidence: r.best?.confidence, band: r.best?.band, isNew: r.isNew, err: r.err })) };
    try { localStorage.setItem(SNAP(ex), JSON.stringify(snap)); localStorage.setItem("sig.watch.lastEx", ex); } catch { /* full */ }
    } finally { busy.current = false; setProg(null); }
  }
  // Auto-refresh while this tab is open and visible (first run after the first manual scan or immediately if results are cached)
  useVisibleInterval(() => { if (every > 0 && rows) run(); }, Math.max(1, every) * 60_000, [every, ex, tf, list, !!rows], false);
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
        <div className="row gap wrap" style={{ marginTop: 10 }}><label className="lbl" htmlFor="wl-every">Auto-refresh</label>
          <select id="wl-every" className="input" value={every} onChange={(e) => { const v = +e.target.value; setEvery(v); localStorage.setItem("sig.watch.every", String(v)); }}>{EVERY.map((m) => <option key={m} value={m}>{m ? `Every ${m} min` : "Off"}</option>)}</select>
          <span className="dim small">{every ? "Runs while this tab is open and visible, after your first scan." : "Manual only."}{at ? ` Last scan ${new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` : ""}</span></div>
      </div>
      {rows && <div className="card"><table className="rt"><thead><tr><th>Symbol</th><th>Side</th><th>Setup</th><th>Confidence</th><th>Best R:R</th><th>Zone 1</th><th></th></tr></thead><tbody>
        {rows.map((r) => { const b = r.best; const bz = b ? b.zones.reduce((a, z) => (z.rr1 > a.rr1 ? z : a)) : null;
          return <tr key={r.symbol}><td data-label="Symbol"><b>{r.symbol}</b>{r.isNew && <span className="badge new" title="Meets the rule now, didn't at the last refresh">New</span>}</td>
            {b ? <><td data-label="Side"><span className={`badge ${b.dir}`}>{b.dir}</span></td><td data-label="Setup">{b.shown ? "Rule met" : <span className="dim">No</span>}</td>
              <td data-label="Confidence" className="num">{b.band} · {b.confidence}%</td><td data-label="Best R:R" className="num">{bz!.rr1.toFixed(1)}R (Z{bz!.rank})</td>
              <td data-label="Zone 1" className="num">{fmt(b.zones[0].bottom)}–{fmt(b.zones[0].top)}</td></> : <td data-label="Error" colSpan={5} className="dim">{r.err}</td>}
            <td data-label=""><button className="btn ghost sm" onClick={() => onOpen(ex, r.symbol, tf)}>Open</button></td></tr>; })}
      </tbody></table><p className="dim small">Confidence = signals agreeing, not win chance.</p></div>}
    </section>
  );
}
