// Device-only storage (IndexedDB). Nothing here is ever sent to a server.
import type { Settings } from "../engine/settings";
export type Emotion = "calm" | "confident" | "fomo" | "fear" | "revenge" | "bored" | "greedy";
export const EMOTIONS: Emotion[] = ["calm", "confident", "fomo", "fear", "revenge", "bored", "greedy"];
export type Trade = {
  id: string; createdAt: number; exchange: string; symbol: string; tf?: string; side: "long" | "short";
  entry: number; exit?: number; stop?: number; size: number; pnl?: number; r?: number;
  signals: string[]; confidence?: number; zone?: number; settings?: Settings; checklist?: Record<string, boolean>;
  screenshot?: string; notes?: string; leverage?: number; liq?: number; emotion?: Emotion; followedPlan?: boolean; source: "manual" | "scan" | "hyperliquid" | "bulk" | "binance-csv"; extId?: string;
};
export type Preset = { name: string; settings: Settings };
export type ChecklistItem = { id: string; text: string };

const DB = "signal", V = 1;
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, V);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("trades", { keyPath: "id" }); d.createObjectStore("kv"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode); const req = fn(t.objectStore(store)); let out: any;
    if (req) req.onsuccess = () => (out = req.result);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
export const db = {
  trades: () => tx<Trade[]>("trades", "readonly", (s) => s.getAll()).then((a) => a.sort((x, y) => y.createdAt - x.createdAt)),
  put: (t: Trade) => tx<void>("trades", "readwrite", (s) => s.put(t)),
  putMany: (ts: Trade[]) => tx<void>("trades", "readwrite", (s) => { ts.forEach((t) => s.put(t)); }),
  del: (id: string) => tx<void>("trades", "readwrite", (s) => s.delete(id)),
  clear: () => tx<void>("trades", "readwrite", (s) => s.clear()),
  get: <T,>(k: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(k)),
  set: (k: string, v: unknown) => tx<void>("kv", "readwrite", (s) => s.put(v, k)),
  _reset: () => { dbp = null; },
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function computeR(t: Pick<Trade, "side" | "entry" | "exit" | "stop">) {
  if (t.exit == null || t.stop == null || t.stop === t.entry) return undefined;
  const risk = Math.abs(t.entry - t.stop); const move = t.side === "long" ? t.exit - t.entry : t.entry - t.exit; return move / risk;
}
export function computePnl(t: Pick<Trade, "side" | "entry" | "exit" | "size">) {
  if (t.exit == null) return undefined; return (t.side === "long" ? t.exit - t.entry : t.entry - t.exit) * t.size;
}

export async function exportJson(): Promise<string> {
  return JSON.stringify({ app: "signal", version: 1, exportedAt: new Date().toISOString(), trades: await db.trades(), presets: await db.get("presets") ?? [], checklist: await db.get("checklist") ?? [], settings: await db.get("settings") ?? null }, null, 2);
}
export async function importJson(text: string): Promise<number> {
  const j = JSON.parse(text); if (j?.app !== "signal" || !Array.isArray(j.trades)) throw new Error("Not a Signal backup file.");
  const trades = j.trades.filter((t: any) => t && typeof t.id === "string" && typeof t.entry === "number");
  await db.putMany(trades);
  if (Array.isArray(j.presets)) await db.set("presets", j.presets);
  if (Array.isArray(j.checklist)) await db.set("checklist", j.checklist);
  return trades.length;
}
