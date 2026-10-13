import { useEffect, useState } from "react";
import { allStrategies, sameSettings, type Strategy } from "../strategies";
import type { Settings } from "../engine/settings";

export function useStrategyList() {
  const [list, setList] = useState<Strategy[]>([]);
  useEffect(() => { const f = () => allStrategies().then(setList); f(); addEventListener("sig-strategies", f); return () => removeEventListener("sig-strategies", f); }, []);
  return list;
}
/** Same picker on Scan and Backtest. */
export function StrategySelect({ value, onChange, current, label = "Strategy" }: { value: string; onChange: (s: Strategy) => void; current?: Settings; label?: string }) {
  const list = useStrategyList(); const sel = list.find((s) => s.id === value); const dirty = !!(sel && current && !sameSettings(sel.settings, current));
  return (
    <label className="stratsel"><span className="lbl">{label}</span>
      <select className="input" value={value} onChange={(e) => { const s = list.find((x) => x.id === e.target.value); if (s) onChange(s); }}>
        <optgroup label="Built-in">{list.filter((s) => s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
        {list.some((s) => !s.builtin) && <optgroup label="My strategies">{list.filter((s) => !s.builtin).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
      </select>
      {dirty && <span className="dim small">edited · <a href="#settings">save in Settings</a></span>}
    </label>
  );
}
