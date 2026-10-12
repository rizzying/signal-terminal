import type { Fill } from "../api/markets";
import type { Trade } from "./db";

/** Round-trip public fills into closed trades (position goes flat → one trade). */
export function fillsToTrades(fills: Fill[], exchange: string, source: Trade["source"] = exchange as Trade["source"]): Trade[] {
  const out: Trade[] = []; const pos: Record<string, { q: number; cost: number; first: number; exitQ: number; exitV: number; pnl: number; side: "long" | "short"; maxQ: number }> = {};
  for (const f of [...fills].sort((a, b) => a.time - b.time)) {
    const s = (pos[f.symbol] ??= { q: 0, cost: 0, first: f.time, exitQ: 0, exitV: 0, pnl: 0, side: "long", maxQ: 0 });
    const signed = f.side === "buy" ? f.sz : -f.sz;
    if (Math.abs(s.q) < 1e-12) Object.assign(s, { q: 0, cost: 0, first: f.time, exitQ: 0, exitV: 0, pnl: 0, side: signed > 0 ? "long" : "short", maxQ: 0 });
    const opening = Math.sign(signed) === Math.sign(s.q) || s.q === 0;
    if (opening) { s.q += signed; s.cost += f.px * Math.abs(signed); s.maxQ = Math.max(s.maxQ, Math.abs(s.q)); }
    else {
      const close = Math.min(Math.abs(signed), Math.abs(s.q)); const avg = s.cost / Math.abs(s.q);
      s.exitQ += close; s.exitV += close * f.px; s.pnl += f.pnl ?? (s.side === "long" ? f.px - avg : avg - f.px) * close;
      s.cost -= avg * close; s.q += Math.sign(signed) * close;
      if (Math.abs(s.q) < 1e-12) {
        const entry = (s.exitV - (s.side === "long" ? s.pnl : -s.pnl)) / s.exitQ;
        out.push({ id: `${exchange}-${f.symbol}-${s.first}`, extId: `${exchange}-${f.symbol}-${s.first}`, createdAt: s.first, exchange, symbol: f.symbol, side: s.side, entry, exit: s.exitV / s.exitQ, size: s.exitQ, pnl: s.pnl, signals: [], source });
        const rest = Math.abs(signed) - close; s.q = 0;
        if (rest > 1e-12) Object.assign(s, { q: Math.sign(signed) * rest, cost: f.px * rest, first: f.time, exitQ: 0, exitV: 0, pnl: 0, side: signed > 0 ? "long" : "short", maxQ: rest });
      }
    }
  }
  return out;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row); return rows;
}
const num = (s?: string) => (s == null ? NaN : parseFloat(s.replace(/[^0-9.\-eE]/g, "")));
/** Binance trade-history CSV (spot "Pair/Executed" or futures "Symbol/Quantity/Realized Profit" exports). */
export function binanceCsvToTrades(text: string): Trade[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, "")); if (rows.length < 2) throw new Error("CSV is empty.");
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  const iD = col("date(utc)", "date", "time"), iS = col("symbol", "pair", "market"), iSide = col("side", "type"), iP = col("price"), iQ = col("quantity", "executed", "amount");
  if ([iD, iS, iSide, iP, iQ].some((i) => i < 0)) throw new Error("Unrecognised Binance CSV: need Date, Symbol/Pair, Side, Price and Quantity/Executed columns.");
  const iPnl = col("realized profit", "realized pnl");
  const fills: Fill[] = rows.slice(1).map((r) => {
    const t = Date.parse(r[iD].trim().replace(" ", "T") + (/[zZ+]/.test(r[iD]) ? "" : "Z"));
    return { time: t, symbol: r[iS].trim(), side: r[iSide].trim().toLowerCase().startsWith("b") ? "buy" : "sell", px: num(r[iP]), sz: Math.abs(num(r[iQ])), pnl: iPnl >= 0 ? num(r[iPnl]) : undefined } as Fill;
  }).filter((f) => Number.isFinite(f.time) && f.px > 0 && f.sz > 0);
  if (!fills.length) throw new Error("No valid trades found in the CSV.");
  return fillsToTrades(fills, "binance", "binance-csv");
}
