import type { Analysis, Setup } from "../engine/scan";
export type LineSpec = { price: number; color: string; title: string; style: number };
type Colors = { accent: string; neg: string; pos: string; warn: string };
/** Every price line for the current view. Only the selected zone, plus up to 3 liquidation clusters on the side that matters for this trade. */
export function lineSpecs(setup: Setup | null, zone: number, analysis: Analysis | null, col: Colors): LineSpec[] {
  const out: LineSpec[] = []; const z = setup?.zones[zone]; if (!setup || !z) return out;
  out.push({ price: z.top, color: col.accent, title: "Entry top", style: 2 }, { price: z.bottom, color: col.accent, title: "Entry bottom", style: 2 },
    { price: z.stop, color: col.neg, title: "Stop", style: 0 }, { price: z.t1, color: col.pos, title: "TP1", style: 0 }, { price: z.t2, color: col.pos, title: "TP2", style: 1 });
  if (analysis?.liq.length) {
    const long = setup.dir === "long";
    // longs' liquidations sit below price (relevant to a long's stop); shorts' sit above
    analysis.liq.map((b) => ({ p: b.price, v: long ? b.long : b.short })).filter((b) => b.v > 0 && (long ? b.p < setup.price : b.p > setup.price))
      .sort((a, b) => b.v - a.v).slice(0, 3).forEach((b) => out.push({ price: b.p, color: col.warn, title: long ? "est. liq (longs)" : "est. liq (shorts)", style: 3 }));
  }
  return out;
}
type Series<L> = { createPriceLine: (o: any) => L; removePriceLine: (l: L) => void };
/** Owns the price lines on one series: sync() always removes every previous line before drawing. */
export class PriceLines<L> {
  private lines: L[] = [];
  constructor(private s: Series<L>) {}
  sync(specs: LineSpec[]) {
    for (const l of this.lines) { try { this.s.removePriceLine(l); } catch { /* series already gone */ } }
    this.lines = specs.map((p) => this.s.createPriceLine({ price: p.price, color: p.color, title: p.title, lineStyle: p.style, lineWidth: 1, axisLabelVisible: true }));
  }
  get count() { return this.lines.length; }
}
