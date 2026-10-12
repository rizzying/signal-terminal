import { oiChange, oiHistory, recentLiqs } from "../src/api/positioning";
import { hits } from "../src/alerts";
const res = (j: unknown) => Promise.resolve(new Response(JSON.stringify(j)));
describe("positioning + alerts", () => {
  it("OI history + change", async () => {
    const p = await oiHistory("BTC", "4h", 3, () => res([{ time: 1, open_interest_usd: 100, lsr_account: 1.5, long_liq_usd: 0, short_liq_usd: 0 }, { time: 2, open_interest_usd: 110, lsr_account: 1.4, long_liq_usd: 0, short_liq_usd: 0 }]));
    expect(p[1]).toMatchObject({ t: 2000, oiUsd: 110 }); expect(oiChange(p, 1)).toBeCloseTo(0.1);
  });
  it("liquidations normalize to USD with contract size and side", async () => {
    const f: any = (u: string) => u.includes("contracts/") ? res({ quanto_multiplier: "0.0001" }) : u.includes("liq_orders") ? res([{ time: 5, size: "200", order_size: "-200", fill_price: "80000" }]) : u.includes("instruments") ? res({ data: [{ ctVal: "0.01" }] }) : res({ data: [{ details: [{ ts: "9000", posSide: "short", bkPx: "80000", sz: "2" }] }] });
    const { liqs } = await recentLiqs("BTC", f);
    expect(liqs.map((l) => [l.venue, l.side, Math.round(l.usd)])).toEqual([["OKX", "short", 1600], ["Gate", "long", 1600]]);
  });
  it("alert hit rules", () => { expect(hits({ kind: "zone", lo: 10, hi: 12 } as any, 11)).toBe(true); expect(hits({ kind: "above", lo: 10 } as any, 9)).toBe(false); expect(hits({ kind: "below", lo: 10 } as any, 9)).toBe(true); });
});
