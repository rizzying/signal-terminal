import type { Analysis, Setup } from "../engine/scan";
export type LineSpec = { price: number; color: string; title: string; style: number; prio?: number; label?: boolean };
type Colors = { accent: string; neg: string; pos: string; warn: string };
/** Every price line for the current view. Only the selected zone, plus up to 3 liquidation clusters on the side that matters for this trade. */
export function lineSpecs(setup: Setup | null, zone: number, analysis: Analysis | null, col: Colors, yourLiq: number | null = null): LineSpec[] {
  const out: LineSpec[] = []; const z = setup?.zones[zone]; if (!setup || !z) return out;
  const mark = z.strength ? ` · ${z.strength}` : "";
  out.push({ price: z.top, color: col.accent, title: `Entry top${mark}`, style: 2 }, { price: z.bottom, color: col.accent, title: "Entry bottom", style: 2 },
    { price: z.stop, color: col.neg, title: "Stop", style: 0 }, { price: z.t1, color: col.pos, title: "TP1", style: 0 }, { price: z.t2, color: col.pos, title: "TP2", style: 1 });
  // your own liquidation: drawn only when it comes before the stop (a warning)
  if (yourLiq != null) out.push({ price: yourLiq, color: col.neg, title: "Your liq", style: 1 });
  if (analysis?.liq.length) {
    const long = setup.dir === "long";
    // longs' liquidations sit below price (relevant to a long's stop); shorts' sit above
    analysis.liq.map((b) => ({ p: b.price, v: long ? b.long : b.short })).filter((b) => b.v > 0 && (long ? b.p < setup.price : b.p > setup.price))
      .sort((a, b) => b.v - a.v).slice(0, 3).forEach((b) => out.push({ price: b.p, color: col.warn, title: long ? "Longs liq zone" : "Shorts liq zone", style: 3, prio: 1 }));
  }
  return out;
}
/** Liquidation clusters that sit inside the entry band (shown on the zone card instead of the axis). */
export const liqInZone = (specs: LineSpec[]) => { const t = specs.find((x) => x.title === "Entry top"), b = specs.find((x) => x.title === "Entry bottom"); if (!t || !b) return []; const lo = Math.min(t.price, b.price), hi = Math.max(t.price, b.price); return specs.filter((x) => x.prio === 1 && x.price >= lo && x.price <= hi); };
/** De-collide axis labels. Trade levels (prio 0) win over est. liq (prio 1); a hidden label keeps its line.
 *  toY maps price → pixel (null if off-screen); gap is ~one label height. */
export function declutter(specs: LineSpec[], toY: (p: number) => number | null, gap = 18): LineSpec[] {
  const inZone = new Set(liqInZone(specs)); const kept: number[] = []; const out = specs.map((x) => ({ ...x, label: true }));
  const order = out.map((x, i) => i).sort((a, b) => (out[a].prio ?? 0) - (out[b].prio ?? 0));
  for (const i of order) { const x = out[i]; const y = toY(x.price);
    if (inZone.has(specs[i]) || (y != null && kept.some((k) => Math.abs(k - y) < gap))) {
      if (x.prio === 1) { x.label = false; x.title = ""; continue; }
      // two trade levels collide (e.g. a thin entry band): keep the line, fold the name into the label already shown
      if (x.title === "Entry bottom") { const top = out.find((o) => o.title === "Entry top" || o.title.startsWith("Entry top · ")); if (top) top.title = top.title.replace(/^Entry top/, "Entry"); x.label = false; x.title = ""; continue; }
      if (x.title === "TP2" || x.title === "Entry top" || x.title.startsWith("Entry top · ") || x.title === "Your liq") { x.label = false; x.title = ""; continue; }
    }
    if (y != null) kept.push(y); }
  return out;
}
type Series<L> = { createPriceLine: (o: any) => L; removePriceLine: (l: L) => void };
/** Owns the price lines on one series: sync() always removes every previous line before drawing. */
export class PriceLines<L> {
  private lines: L[] = []; private sig = "";
  constructor(private s: Series<L>) {}
  sync(specs: LineSpec[], force = true) {
    const sig = JSON.stringify(specs); if (!force && sig === this.sig) return; this.sig = sig;
    for (const l of this.lines) { try { this.s.removePriceLine(l); } catch { /* series already gone */ } }
    this.lines = specs.map((p) => this.s.createPriceLine({ price: p.price, color: p.color, title: p.title, lineStyle: p.style, lineWidth: 1, axisLabelVisible: p.label !== false }));
  }
  get count() { return this.lines.length; }
}
