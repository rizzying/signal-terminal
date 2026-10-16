import { gradeZone, zoneScore, type ZoneFacts } from "../src/engine/zoneStrength";
import { scan } from "../src/engine/scan";
import { DEFAULTS } from "../src/engine/settings";
import { rulesHash } from "../src/forward/trader";
import { LEGACY_SPEC } from "../src/forward/trader";
import type { Candle } from "../src/engine/indicators";
import { describeAlert } from "../src/alerts";
import { bestShown, rankShown, shortfall, todaySymbols } from "../src/ui/todayRank";

const base = (over: Partial<ZoneFacts> = {}): ZoneFacts => ({
  kind: "Swing", distAtr: 3, ageBars: 200, retests: null, liqOnStructure: false, stopNudged: false, structureAgrees: false, kindAgrees: false, ...over,
});

describe("zone strength", () => {
  it("scores the documented points and bands", () => {
    const strong = base({ kind: "OB", distAtr: 0.5, ageBars: 10, liqOnStructure: true, structureAgrees: true, kindAgrees: true });
    expect(zoneScore(strong)).toBe(10); expect(gradeZone(strong).grade).toBe("Strong");
    const ok = base({ distAtr: 1.5, ageBars: 40, structureAgrees: true });
    expect(zoneScore(ok)).toBe(5); expect(gradeZone(ok).grade).toBe("OK");
    const weak = base();
    expect(zoneScore(weak)).toBe(2); expect(gradeZone(weak).grade).toBe("Weak");
    const br = base({ kind: "Breaker", distAtr: 0.4, ageBars: 5, retests: 0, structureAgrees: true, kindAgrees: true });
    expect(zoneScore(br)).toBe(8); expect(gradeZone(br).grade).toBe("Strong");
    const liq = base({ kind: "Liq", distAtr: 0.9, ageBars: 0, structureAgrees: true });
    expect(zoneScore(liq)).toBe(4); expect(gradeZone(liq).grade).toBe("OK");
    const nudged = base({ stopNudged: true });
    expect(zoneScore(nudged)).toBe(3); expect(gradeZone(nudged).grade).toBe("OK");
  });
  it("an ATR step is always Weak, even when the other facts would score", () => {
    const atr = base({ kind: "ATR", distAtr: 0.2, structureAgrees: true });
    expect(zoneScore(atr)).toBe(3); expect(gradeZone(atr).grade).toBe("Weak");
    expect(gradeZone(atr).why).toMatch(/no structure/);
  });
  it("is deterministic", () => {
    const f = base({ kind: "FVG", distAtr: 1.2, ageBars: 30, liqOnStructure: true, structureAgrees: true, kindAgrees: true });
    expect(gradeZone(f)).toEqual(gradeZone({ ...f }));
  });
  it("does not move prices, rank, confidence, or the frozen rules hashes", () => {
    expect(rulesHash()).toBe("c376e7f0");
    expect(rulesHash(LEGACY_SPEC)).toBe("b81ceeeb");
    const mk = (closes: number[]): Candle[] => closes.map((c, i) => { const o = i ? (closes[i - 1] + c) / 2 : c; return { t: i * 9e5, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: 10 }; });
    const c = mk(Array.from({ length: 300 }, (_, i) => 100 + 0.2 * i + 6 * Math.sin(i / 4)));
    const s = scan(c, "long", DEFAULTS);
    expect(s.confidence).toBe(56); expect(s.band).toBe("Medium"); expect(s.shown).toBe(true);
    expect(s.zones.map((z) => z.rank)).toEqual([1, 2, 3]);
    expect(s.zones.map((z) => z.source)).toEqual(["Bullish FVG", "Bullish FVG", "Bullish FVG"]);
    expect(s.zones.map((z) => z.entry)).toEqual([154.7349000182552, 152.5113754555692, 151.06567700778507]);
    expect(s.zones.map((z) => z.stop)).toEqual([152.1880225350883, 148.85994002534895, 148.20754916007286]);
    expect(s.zones.map((z) => z.t1)).toEqual([159.82865498458898, 159.81424631600973, 156.7819327032095]);
    for (const z of s.zones) expect(["Strong", "OK", "Weak"]).toContain(z.strength);
  });
});

describe("today coin setups", () => {
  it("keeps one coin each, best first, and does not pad", () => {
    expect(todaySymbols("ETH", ["BTC", "ETH", "SOL", "XRP"])).toEqual(["ETH", "BTC", "SOL", "XRP"]);
    expect(todaySymbols("BTC", Array.from({ length: 20 }, (_, i) => `C${i}`))).toHaveLength(12);
    const side = (dir: "long" | "short", shown: boolean, confidence: number, rr: number) => ({ dir, shown, confidence, rr });
    expect(bestShown(side("long", false, 80, 9), side("short", true, 40, 2))).toBe("short");
    expect(bestShown(side("long", true, 50, 2), side("short", true, 50, 4))).toBe("short");
    expect(bestShown(side("long", true, 50, 2), side("short", true, 50, 2))).toBe("long");
    expect(bestShown(side("long", false, 90, 9), side("short", false, 90, 9))).toBeNull();
    const rows = rankShown([
      { symbol: "ETH", confidence: 70, rr: 2 },
      { symbol: "ETH", confidence: 40, rr: 9 },
      { symbol: "SOL", confidence: 70, rr: 3 },
      { symbol: "BTC", confidence: 55, rr: 2 },
    ]);
    expect(rows.map((r) => r.symbol)).toEqual(["SOL", "ETH", "BTC"]);
    expect(shortfall(0)).toBe("No coins have a setup right now.");
    expect(shortfall(1)).toBe("Only 1 coin has a setup right now.");
    expect(shortfall(2)).toBe("Only 2 coins have a setup right now.");
    expect(shortfall(3)).toBeNull();
  });
});

describe("alert names", () => {
  const row = { id: "a", exchange: "hyperliquid", symbol: "BTC", label: "long Zone 2 entry 1–2", kind: "zone" as const, lo: 100, hi: 110, createdAt: 1 };
  it("names coin, timeframe, side, zone, and price, including older rows", () => {
    expect(describeAlert(row)).toEqual({ coin: "BTC", tf: "—", sideZone: "long · Zone 2", price: "100–110" });
    expect(describeAlert({ ...row, tf: "4h", side: "long", zone: 2 })).toMatchObject({ tf: "4H", sideZone: "long · Zone 2" });
    expect(describeAlert({ ...row, kind: "above", lo: 82000, hi: 82000, label: "price above 82,000" })).toMatchObject({ sideZone: "above", price: "82,000" });
  });
});
