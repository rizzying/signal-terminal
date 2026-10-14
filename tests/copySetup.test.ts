import { setupText } from "../src/ui/copySetup";
const zone = { rank: 2, name: "Balanced", bottom: 82551, top: 82667.4, stop: 81311.8, t1: 85279.3, t2: 86670, rr1: 2, rr2: 2.6 };
const base = { market: "BTC-PERP", exchange: "Hyperliquid", tf: "4h", dir: "long" as const, zone, confidence: 22, band: "Low", lev: 5, liq: 67120, at: Date.parse("2026-10-14T01:45:00Z") };
it("copied setup text has every field", () => {
  const t = setupText(base).split("\n");
  expect(t[0]).toBe("BTC-PERP · Hyperliquid · 4H · LONG"); expect(t[1]).toBe("Zone 2 (Balanced)");
  expect(t[2]).toMatch(/^Entry: 82,?551/); expect(t[3]).toMatch(/^Stop: 81,?311\.8/); expect(t[4]).toMatch(/^TP1: .* · TP2: /);
  expect(t[5]).toBe("R:R (net of costs): 2.0R / 2.6R"); expect(t[6]).toMatch(/^Leverage: 5× · est\. liquidation 67,?120$/);
  expect(t[7]).toBe("Confidence: Low (22%, signals agreeing, not win chance)"); expect(t[8]).toBe("Time: 14 Oct 2026, 08:45 WIB");
});
it("spot and liq-before-stop variants", () => {
  expect(setupText({ ...base, lev: null, liq: null })).toContain("Leverage: spot, no liquidation");
  expect(setupText({ ...base, liqBeforeStop: true })).toContain("(before stop!)");
});

import { zoneAtPrice, TOAST_MS } from "../src/ui/copySetup";
it("chart click maps price to a zone; toast lasts ~2.5s", () => {
  const zs = [{ bottom: 100, top: 110 }, { bottom: 90, top: 95 }, { bottom: 70, top: 72 }];
  expect(zoneAtPrice(zs, 105)).toBe(0); expect(zoneAtPrice(zs, 95.5)).toBe(1); expect(zoneAtPrice(zs, 80)).toBe(-1); expect(TOAST_MS).toBe(2500);
});
