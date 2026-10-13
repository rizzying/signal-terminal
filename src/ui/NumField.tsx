import { useEffect, useRef, useState } from "react";
/** Number input you can type into freely (including clearing it). Clamps to [min,max] only on blur or Enter; -/+ steppers for touch. */
export function clampNum(text: string, min: number, max: number, step: number, fallback: number): number {
  const v = parseFloat(text.replace(",", ".").trim()); if (!Number.isFinite(v)) return fallback;
  const dec = (String(step).split(".")[1] ?? "").length; return +Math.min(max, Math.max(min, v)).toFixed(dec);
}
export function NumField({ value, min, max, step = 1, onCommit, label, id, steppers = false, width = 72 }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; label: string; id?: string; steppers?: boolean; width?: number }) {
  const [text, setText] = useState(String(value)); const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  const last = useRef(value); last.current = value;
  const commit = () => { const v = clampNum(text, min, max, step, last.current); setText(String(v)); if (v !== last.current) { last.current = v; onCommit(v); } };
  const bump = (d: number) => { const v = clampNum(String((Number.isFinite(+value) ? value : min) + d * step), min, max, step, value); setText(String(v)); if (v !== value) onCommit(v); };
  const input = <input id={id} className="input num mono" type="text" inputMode="decimal" autoComplete="off" aria-label={label} style={{ width }} value={text}
    onFocus={(e) => { focused.current = true; e.currentTarget.select(); }} onChange={(e) => setText(e.target.value)}
    onBlur={() => { focused.current = false; commit(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }} />;
  if (!steppers) return input;
  return <span className="stepper"><button type="button" className="btn ghost step" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => bump(-1)}>−</button>{input}<button type="button" className="btn ghost step" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => bump(1)}>+</button></span>;
}
