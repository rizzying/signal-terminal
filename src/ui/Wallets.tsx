import { useVisibleInterval } from "./useVisibleInterval";
import { useEffect, useState } from "react";
import { isAddress, walletSnapshot, type WSnap } from "../api/wallets";
import { fmt } from "../engine/scan";

type W = { ex: "hyperliquid" | "bulk"; address: string; name: string };
const K = "sig.wallets";
const load = (): W[] => { try { return JSON.parse(localStorage.getItem(K) || "[]"); } catch { return []; } };
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export function Wallets() {
  const [ws, setWs] = useState<W[]>(load); const [snaps, setSnaps] = useState<Record<string, WSnap | string>>({});
  const [ex, setEx] = useState<W["ex"]>("hyperliquid"); const [addr, setAddr] = useState(""); const [name, setName] = useState(""); const [err, setErr] = useState<string | null>(null);
  const save = (x: W[]) => { setWs(x); localStorage.setItem(K, JSON.stringify(x)); };
  const refresh = () => ws.forEach((w) => walletSnapshot(w.ex, w.address).then((s) => setSnaps((p) => ({ ...p, [w.address]: s }))).catch((e) => setSnaps((p) => ({ ...p, [w.address]: e.message ?? "failed" }))));
  useVisibleInterval(refresh, 30_000, [ws]);
  return (
    <section className="stack rise">
      <div className="card">
        <div className="cardhead"><h2>Wallet watcher</h2><span className="lbl">view-only · public addresses</span></div>
        <form className="row wrap gap" onSubmit={(e) => { e.preventDefault(); const a = addr.trim(); if (!isAddress(ex, a)) return setErr(ex === "hyperliquid" ? "Enter a 0x… Hyperliquid address (42 characters)." : "Enter a Bulk (Solana-style) address."); if (ws.some((w) => w.address === a)) return setErr("Already watching."); setErr(null); save([...ws, { ex, address: a, name: name.trim() || short(a) }]); setAddr(""); setName(""); }}>
          <select className="input" aria-label="Exchange" value={ex} onChange={(e) => setEx(e.target.value as W["ex"])}><option value="hyperliquid">Hyperliquid</option><option value="bulk">Bulk</option></select>
          <input className="input grow" aria-label="Public wallet address" placeholder="Public address (never a private key)" value={addr} onChange={(e) => setAddr(e.target.value)} />
          <input className="input" aria-label="Nickname" placeholder="Nickname" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary">Watch</button>
        </form>
        {err && <p className="alert" role="alert" style={{ marginTop: 12 }}>{err}</p>}
        <p className="dim small">Saved on this device only. Refreshes every 30 seconds. Never paste a private key or seed phrase anywhere.</p>
      </div>
      {ws.map((w) => { const s = snaps[w.address];
        return <div className="card" key={w.address}>
          <div className="cardhead"><h2>{w.name} <span className="dim small mono">{w.ex === "hyperliquid" ? "Hyperliquid" : "Bulk"} · {short(w.address)}</span></h2>
            <span className="row gap">{typeof s === "object" && s.equity != null && <span className="mono">Equity ${fmt(s.equity)}</span>}<button className="btn ghost sm" onClick={() => save(ws.filter((x) => x.address !== w.address))}>Remove</button></span></div>
          {s == null ? <p className="skel" role="status">Loading…</p> : typeof s === "string" ? <p className="alert">Couldn't load: {s}</p> : s.positions.length === 0 ? <p className="dim">No open positions.</p> :
            <table className="rt"><thead><tr><th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Value</th><th>Unrealized P&L</th><th>Lev.</th><th>Liq. price</th></tr></thead><tbody>
              {s.positions.map((p) => <tr key={p.symbol}><td data-label="Symbol"><b>{p.symbol}</b></td><td data-label="Side"><span className={`badge ${p.side}`}>{p.side}</span></td><td data-label="Size" className="num">{fmt(p.size)}</td><td data-label="Entry" className="num">{fmt(p.entry)}</td>
                <td data-label="Value" className="num">${fmt(p.notional)}</td><td data-label="Unrealized P&L" className={`num ${p.upnl >= 0 ? "pos" : "neg"}`}>{p.upnl >= 0 ? "+" : "−"}${fmt(Math.abs(p.upnl))}</td><td data-label="Lev." className="num">{p.lev ? `${p.lev}x` : "–"}</td><td data-label="Liq. price" className="num">{p.liq ? fmt(p.liq) : "–"}</td></tr>)}
            </tbody></table>}
        </div>; })}
    </section>
  );
}
