import { useState } from "react";
import { NumField } from "./NumField";
import { setLev, useLev } from "../leverage";
import { DEFAULTS, PARAMS, SIGNAL_NAMES, sanitize, type Settings, type SignalKey } from "../engine/settings";
import { createStrategy, deleteStrategy, sameSettings, saveStrategy, type Strategy } from "../strategies";
import { useLabs, setLabs, useRisk, setRisk } from "../labs";
import { StrategySelect, useStrategyList } from "./StrategyPicker";

export function SettingsView({ settings, setSettings, stratId, onPickStrategy }: { settings: Settings; setSettings: (s: Settings) => void; stratId: string; onPickStrategy: (s: Strategy) => void }) {
  const lev = useLev(stratId, settings.leverage ?? 5);
  const upd = (k: keyof Settings, v: unknown) => setSettings(sanitize({ ...settings, [k]: v }));
  const groups = [...new Set(PARAMS.map((p) => p.group))]; const labs = useLabs(); const risk = useRisk(); const [riskTxt, setRiskTxt] = useState(String(risk));
  return (
    <section className="stack rise">
      <div className="card" data-labs>
        <div className="cardhead"><h2>Labs</h2><span className="lbl">experimental · saved on this device</span></div>
        <label className="param"><span>Backtest (experimental)<small className="dim"> · adds a Backtest tab under More. Past results, not a promise.</small></span><input type="checkbox" aria-label="Backtest (experimental)" checked={labs.backtest} onChange={(e) => setLabs({ ...labs, backtest: e.target.checked })} /></label>
        <label className="param"><span>Forward test<small className="dim"> · adds a Forward test tab under More. Live paper results of past setups, still a small sample.</small></span><input type="checkbox" aria-label="Forward test" checked={labs.forward} onChange={(e) => setLabs({ ...labs, forward: e.target.checked })} /></label>
        <label className="param"><span>Risk per trade ($)<small className="dim"> · pretend amount for dollar P&L on the Forward test page (1R = this). Display only.</small></span><input type="number" min={1} step={1} aria-label="Risk per trade" value={riskTxt} onBlur={() => setRiskTxt(String(risk))} onChange={(e) => { setRiskTxt(e.target.value); const v = Number(e.target.value); if (v > 0) setRisk(v); }} style={{ width: "7em" }} /></label>
      </div>
      <StrategiesCard settings={settings} stratId={stratId} onPick={onPickStrategy} setSettings={setSettings} />
      {groups.map((g) => (
        <div className="card" key={g}><div className="cardhead"><h2>{g}</h2></div>
          <div className="params">{PARAMS.filter((p) => p.group === g).map((p) => {
            const v = settings[p.key] as number; const d = DEFAULTS[p.key] as number;
            return <label key={p.key} className="param"><span>{p.label}{p.help && <small className="dim"> · {p.help}</small>}</span>
              <span className="row gap">{p.key === "leverage" ? <NumField label={p.label} min={p.min} max={p.max} step={1} steppers value={lev} onCommit={(x) => setLev(stratId, x)} /> : <NumField label={p.label} min={p.min} max={p.max} step={p.step} value={v} onCommit={(x) => upd(p.key, x)} />}
                <button type="button" className="btn ghost sm" disabled={(p.key === "leverage" ? lev : v) === d} onClick={() => (p.key === "leverage" ? setLev(stratId, d) : upd(p.key, d))} aria-label={`Reset ${p.label} to ${d}`}>↺ {d}</button></span></label>;
          })}
          {g === "Confidence" && <>
            <label className="param"><span>Show higher-timeframe context note<small className="dim"> · never affects confidence</small></span><input type="checkbox" checked={settings.useHtf} onChange={(e) => upd("useHtf", e.target.checked)} /></label>
            <label className="param"><span>Require structure (BoS/ChoCH) to agree<small className="dim"> · hard gate</small></span><input type="checkbox" checked={settings.gateStructure} onChange={(e) => upd("gateStructure", e.target.checked)} /></label>
            <label className="param"><span>Use “Breakout with volume”</span><input type="checkbox" checked={settings.useBreakout} onChange={(e) => upd("useBreakout", e.target.checked)} /></label>
            <label className="param"><span>Use “Liq magnet” (heavy est. liq cluster lines up with an OB/FVG/breaker/swing zone, within 0.5 ATR)</span><input type="checkbox" checked={settings.useLiqMagnet} onChange={(e) => upd("useLiqMagnet", e.target.checked)} /></label>
            <label className="param"><span>Only unbroken order blocks</span><input type="checkbox" checked={settings.obMustBreak} onChange={(e) => upd("obMustBreak", e.target.checked)} /></label>
            <label className="param"><span>Enter only after a candle closes inside the zone<small className="dim"> · off = first touch</small></span><input type="checkbox" checked={settings.entryOnClose} onChange={(e) => upd("entryOnClose", e.target.checked)} /></label>
            <label className="param"><span>Exit (backtest)</span><select className="input" value={settings.exitMode} onChange={(e) => upd("exitMode", +e.target.value as 0 | 1 | 2)}><option value={0}>All at TP1</option><option value={1}>Half at 2R, rest at 3R</option><option value={2}>Half at 2R, rest to break-even</option></select></label>
            {(Object.keys(SIGNAL_NAMES) as SignalKey[]).map((k) => <label key={k} className="param"><span>Weight: {SIGNAL_NAMES[k]}<small className="dim"> · 0 = off</small></span>
              <NumField label={`Weight ${SIGNAL_NAMES[k]}`} min={0} max={3} step={0.5} value={settings.weights[k]} onCommit={(x) => setSettings(sanitize({ ...settings, weights: { ...settings.weights, [k]: x } }))} /></label>)}
          </>}
          </div></div>
      ))}
    </section>
  );
}

function StrategiesCard({ settings, stratId, onPick, setSettings }: { settings: Settings; stratId: string; onPick: (s: Strategy) => void; setSettings: (s: Settings) => void }) {
  const list = useStrategyList(); const cur = list.find((s) => s.id === stratId); const dirty = !!cur && !sameSettings(cur.settings, settings);
  const [name, setName] = useState(""); const [renaming, setRenaming] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const done = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  return (
    <div className="card">
      <div className="cardhead"><h2>Strategies</h2><span className="lbl">saved on this device</span></div>
      <p className="dim small">A strategy is the full rule set below: signals on/off, weights, minimum count, risk, spread and fees. Pick one to load it; edits below change the loaded copy until you save.</p>
      <div className="row wrap gap"><StrategySelect value={stratId} onChange={onPick} current={settings} label="Loaded" />
        {dirty && <span className="badge">unsaved changes</span>}</div>
      <div className="row wrap gap" style={{ marginTop: 12 }}>
        {cur && !cur.builtin && <button className="btn primary" disabled={!dirty} onClick={async () => { await saveStrategy({ ...cur, settings }); done(`Saved “${cur.name}”.`); }}>Save changes</button>}
        {cur && dirty && <button className="btn ghost" onClick={() => setSettings(cur.settings)}>Discard changes</button>}
        {cur && <button className="btn" onClick={async () => { const n = await createStrategy(`${cur.name} copy`, settings); onPick(n); done(`Created “${n.name}”.`); }}>Duplicate</button>}
        {cur && !cur.builtin && <button className="btn" onClick={() => { setName(cur.name); setRenaming(true); }}>Rename</button>}
        {cur && !cur.builtin && <button className="btn ghost" onClick={async () => { if (!confirm(`Delete “${cur.name}” from this device?`)) return; await deleteStrategy(cur.id); onPick(list[0]); done("Deleted."); }}>Delete</button>}
      </div>
      {renaming && cur && <form className="row gap" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); await saveStrategy({ ...cur, name: name.trim() || cur.name }); setRenaming(false); done("Renamed."); }}><input className="input grow" aria-label="Strategy name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary">Save name</button></form>}
      <form className="row gap" style={{ marginTop: 12 }} onSubmit={async (e) => { e.preventDefault(); const n = await createStrategy(name.trim() || "My strategy", settings); setName(""); onPick(n); done(`Created “${n.name}”.`); }}>
        <input className="input grow" aria-label="New strategy name" placeholder="New strategy name" value={renaming ? "" : name} onChange={(e) => setName(e.target.value)} /><button className="btn">Save as new</button>
      </form>
      {msg && <p className="note" role="status">{msg}</p>}
      <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setSettings(sanitize(DEFAULTS))}>Reset all fields to defaults</button>
    </div>
  );
}
