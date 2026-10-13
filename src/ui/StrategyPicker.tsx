import { useEffect, useState } from "react";
import { allStrategies, sameSettings, type Strategy } from "../strategies";
import type { Settings } from "../engine/settings";
import { TESTED } from "../tested";

export function TestedNote({ id, zone }: { id: string; zone: number }) {
  const t = TESTED[id]?.[zone + 1]; if (!t) return null; const o = t.oos;
  return <p className="dim small tested" data-tested><span className="badge">tested</span> Zone {zone + 1}, out-of-sample (BTC/ETH/SOL · 1h/4H/1D): {o.n} trades, {o.win.toFixed(0)}% wins, {o.exp >= 0 ? "+" : ""}{o.exp.toFixed(2)}R per trade after fees, max drawdown {o.dd.toFixed(0)}R. In-sample it was {t.is.exp >= 0 ? "+" : ""}{t.is.exp.toFixed(2)}R. <b>No reliable edge found</b>; use the zones as a level map. <a href="https://github.com/rizzying/signal-terminal/blob/main/docs/BACKTEST.md" target="_blank" rel="noopener noreferrer">Details</a></p>;
}

export function useStrategyList() {
  const [list, setList] = useState<Strategy[]>([]);
  useEffect(() => { const f = () => allStrategies().then(setList); f(); addEventListener("sig-strategies", f); return () => removeEventListener("sig-strategies", f); }, []);
  return list;
}
/** Same picker on Scan and Backtest. */
export function StrategySelect({ value, onChange, current, label = "Strategy", zone }: { value: string; onChange: (s: Strategy) => void; current?: Settings; label?: string; zone?: number }) {
  const list = useStrategyList(); const sel = list.find((s) => s.id === value); const dirty = !!(sel && current && !sameSettings(sel.settings, current));
  return (<>
    <label className="stratsel"><span className="lbl">{label}</span>
      <select className="input" value={value} onChange={(e) => { const s = list.find((x) => x.id === e.target.value); if (s) onChange(s); }}>
        <optgroup label="Built-in">{list.filter((s) => s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
        {list.some((s) => !s.builtin) && <optgroup label="My strategies">{list.filter((s) => !s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
      </select>
      {dirty && <span className="dim small">edited · <a href="#settings">save in Settings</a></span>}
    </label>
    {zone != null && <TestedNote id={value} zone={zone} />}</>
  );
}
