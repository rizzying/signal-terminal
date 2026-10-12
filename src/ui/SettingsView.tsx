import { useEffect, useState } from "react";
import { DEFAULTS, PARAMS, SIGNAL_NAMES, sanitize, type Settings, type SignalKey } from "../engine/settings";
import { db, type Preset } from "../journal/db";

export function SettingsView({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const [presets, setPresets] = useState<Preset[]>([]); const [name, setName] = useState("");
  useEffect(() => { db.get<Preset[]>("presets").then((p) => setPresets(p ?? [])); }, []);
  const savePresets = (p: Preset[]) => { setPresets(p); db.set("presets", p); };
  const upd = (k: keyof Settings, v: unknown) => setSettings(sanitize({ ...settings, [k]: v }));
  const groups = [...new Set(PARAMS.map((p) => p.group))];
  return (
    <section className="stack rise">
      <div className="card">
        <div className="cardhead"><h2>Presets</h2><button className="btn ghost sm" onClick={() => setSettings(sanitize(DEFAULTS))}>Reset all to defaults</button></div>
        <ul className="presetlist">{presets.map((p) => <li key={p.name}><button className="btn" onClick={() => setSettings(sanitize(p.settings))}>Load {p.name}</button><button className="btn ghost sm" aria-label={`Delete preset ${p.name}`} onClick={() => savePresets(presets.filter((x) => x.name !== p.name))}>Delete</button></li>)}{!presets.length && <li className="dim small">No presets yet. Saved on this device only.</li>}</ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; savePresets([...presets.filter((p) => p.name !== n), { name: n, settings }]); setName(""); }}>
          <input className="input grow" aria-label="Preset name" placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary">Save current</button>
        </form>
      </div>
      {groups.map((g) => (
        <div className="card" key={g}><div className="cardhead"><h2>{g}</h2></div>
          <div className="params">{PARAMS.filter((p) => p.group === g).map((p) => {
            const v = settings[p.key] as number; const d = DEFAULTS[p.key] as number;
            return <label key={p.key} className="param"><span>{p.label}{p.help && <small className="dim"> · {p.help}</small>}</span>
              <span className="row gap"><input className="input num" type="number" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => upd(p.key, e.target.value === "" ? d : +e.target.value)} />
                <button type="button" className="btn ghost sm" disabled={v === d} onClick={() => upd(p.key, d)} aria-label={`Reset ${p.label} to ${d}`}>↺ {d}</button></span></label>;
          })}
          {g === "Confidence" && <>
            <label className="param"><span>Show higher-timeframe context note<small className="dim"> · never affects confidence</small></span><input type="checkbox" checked={settings.useHtf} onChange={(e) => upd("useHtf", e.target.checked)} /></label>
            <label className="param"><span>Require structure (BoS/ChoCH) to agree<small className="dim"> · hard gate</small></span><input type="checkbox" checked={settings.gateStructure} onChange={(e) => upd("gateStructure", e.target.checked)} /></label>
            <label className="param"><span>Only unbroken order blocks</span><input type="checkbox" checked={settings.obMustBreak} onChange={(e) => upd("obMustBreak", e.target.checked)} /></label>
            {(Object.keys(SIGNAL_NAMES) as SignalKey[]).map((k) => <label key={k} className="param"><span>Weight: {SIGNAL_NAMES[k]}<small className="dim"> · 0 = off</small></span>
              <input className="input num" type="number" min={0} max={3} step={0.5} value={settings.weights[k]} onChange={(e) => setSettings(sanitize({ ...settings, weights: { ...settings.weights, [k]: Math.max(0, Math.min(3, +e.target.value || 0)) } }))} /></label>)}
          </>}
          </div></div>
      ))}
    </section>
  );
}
