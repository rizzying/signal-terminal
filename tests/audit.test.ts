import { getJson, candles } from "../src/api/markets";
import { hitsRange, type Alert } from "../src/alerts";
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
describe("v2.4 network hardening", () => {
  it("de-duplicates identical in-flight requests", async () => {
    let n = 0; const f = (async () => { n++; await new Promise((r) => setTimeout(r, 20)); return ok({ a: 1 }); }) as any;
    const [a, b] = await Promise.all([getJson("binance", "https://x/1", undefined, f), getJson("binance", "https://x/1", undefined, f)]);
    expect(n).toBe(1); expect(a).toEqual(b); await getJson("binance", "https://x/1", undefined, f); expect(n).toBe(2); // not cached after it settles
  });
  it("Hyperliquid 500 'null' = not listed, no slow retries", async () => {
    let n = 0; const f = (async () => { n++; return new Response("null", { status: 500 }); }) as any; const t0 = Date.now();
    await expect(candles("hyperliquid", "NOPE", "4h", 50, f)).rejects.toThrow(/Not listed on Hyperliquid/); expect(n).toBe(1); expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("4xx explains itself using the exchange's message", async () => {
    const f = (async () => new Response(JSON.stringify({ code: -1121, msg: "Invalid symbol." }), { status: 400 })) as any;
    await expect(getJson("binance", "https://x/bad", undefined, f)).rejects.toThrow("Not available on binance (Invalid symbol.).");
  });
});
describe("alerts catch wicks between checks", () => {
  const a = (kind: Alert["kind"], lo: number, hi = lo): Alert => ({ id: "1", exchange: "hyperliquid", symbol: "BTC", label: "", kind, lo, hi, createdAt: 0 });
  it("zone touched by a wick even if price is outside now", () => { expect(hitsRange(a("zone", 100, 101), 99.5, 105)).toBe(true); expect(hitsRange(a("zone", 100, 101), 101.5, 105)).toBe(false); });
  it("above/below levels", () => { expect(hitsRange(a("above", 110), 100, 110.2)).toBe(true); expect(hitsRange(a("below", 90), 89.9, 100)).toBe(true); expect(hitsRange(a("below", 90), 90.1, 100)).toBe(false); });
});
