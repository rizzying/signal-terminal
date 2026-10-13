// Saved strategies = named, complete rulesets (signals on/off, weights, min count, risk, spread/fees). Device-only.
import { DEFAULTS, sanitize, type Settings } from "./engine/settings";
import { db } from "./journal/db";
export type Strategy = { id: string; name: string; builtin?: boolean; settings: Settings; updatedAt?: number };
const w = (o: Partial<Settings["weights"]>) => ({ structure: 0, fvgob: 0, swings: 0, breaker: 0, inducement: 0, rsi: 0, ema: 0, breakout: 0, liqmagnet: 0, ...o });
export const BUILTINS: Strategy[] = [
  { id: "b-default", name: "Signal default", builtin: true, settings: sanitize(DEFAULTS) },
  { id: "b-ema-rsi", name: "Double EMA 21/50 + RSI", builtin: true, settings: sanitize({ emaFast: 21, emaSlow: 50, weights: w({ ema: 2, rsi: 1, structure: 0.5 }), gateStructure: false, minOthers: 2 }) },
  { id: "b-breakout", name: "Breakout with volume", builtin: true, settings: sanitize({ useBreakout: true, weights: w({ breakout: 2, structure: 1, ema: 1, rsi: 1 }), gateStructure: true, minOthers: 1 }) },
  { id: "b-smc", name: "Structure + FVG/OB", builtin: true, settings: sanitize({ weights: w({ structure: 1, fvgob: 1, swings: 1, breaker: 1, inducement: 1 }), gateStructure: true, minOthers: 2, useBreakout: false }) },
];
const ev = () => dispatchEvent(new Event("sig-strategies"));
export async function userStrategies(): Promise<Strategy[]> {
  let u = await db.get<Strategy[]>("strategies");
  if (!u) { // migrate v1 presets → strategies
    const ps = (await db.get<{ name: string; settings: Settings }[]>("presets")) ?? [];
    u = ps.map((p, i) => ({ id: `u-${Date.now().toString(36)}-${i}`, name: p.name, settings: sanitize(p.settings), updatedAt: Date.now() })); await db.set("strategies", u);
  }
  return u.map((s) => ({ ...s, settings: sanitize(s.settings) }));
}
export async function allStrategies() { return [...BUILTINS, ...(await userStrategies())]; }
export async function saveStrategy(s: Strategy) { if (s.builtin) throw new Error("Built-in strategies can't be changed; duplicate it first."); const u = await userStrategies(); const i = u.findIndex((x) => x.id === s.id); const next = { ...s, settings: sanitize(s.settings), updatedAt: Date.now() }; if (i >= 0) u[i] = next; else u.push(next); await db.set("strategies", u); ev(); return next; }
export async function createStrategy(name: string, settings: Settings) { return saveStrategy({ id: `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: uniqueName(name, await allStrategies()), settings }); }
export async function deleteStrategy(id: string) { await db.set("strategies", (await userStrategies()).filter((x) => x.id !== id)); ev(); }
export const uniqueName = (n: string, all: Strategy[]) => { let name = n.trim() || "My strategy", i = 2; while (all.some((s) => s.name === name)) name = `${n.trim()} (${i++})`; return name; };
export const activeId = async () => (await db.get<string>("activeStrategy")) ?? "b-default";
export const setActiveId = async (id: string) => { await db.set("activeStrategy", id); ev(); };
export const sameSettings = (a: Settings, b: Settings) => JSON.stringify(sanitize(a)) === JSON.stringify(sanitize(b));
