import { useEffect, useState } from "react";
import { baseAsset } from "../api/funding";
import { oiHistory, type OIPoint } from "../api/positioning";
import { FundingPanel } from "./Funding";
import { PositioningPanel } from "./Positioning";

const QUICK = ["BTC", "ETH", "SOL", "XRP", "DOGE", "HYPE"];
export function MarketView() {
  const [base, setBase] = useState(() => baseAsset(localStorage.getItem("sig.sym") || "BTC")); const [q, setQ] = useState("");
  const [oi, setOi] = useState<OIPoint[] | null>(null);
  useEffect(() => { let live = true; setOi(null); oiHistory(base, "4h", 60).then((x) => live && setOi(x)).catch(() => {}); return () => { live = false; }; }, [base]);
  return (
    <section className="stack rise">
      <div className="card controls">
        <span className="lbl">Asset</span>
        <div className="chips">{QUICK.map((b) => <button key={b} className={`chip ${b === base ? "on" : ""}`} aria-pressed={b === base} onClick={() => setBase(b)}>{b}</button>)}</div>
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); const b = baseAsset(q.trim()); if (b) { setBase(b); setQ(""); } }}>
          <input className="input" aria-label="Other asset" placeholder="Other, e.g. LINK" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn">Show</button>
        </form>
      </div>
      <FundingPanel symbol={base} />
      <PositioningPanel symbol={base} oi={oi} />
    </section>
  );
}
