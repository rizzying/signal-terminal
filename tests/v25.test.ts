import { HlSocket } from "../src/api/live";
import { listMarkets, roundTick } from "../src/api/markets";
import { roundSetup, scan } from "../src/engine/scan";
import { DEFAULTS } from "../src/engine/settings";
import { countdown, nextEvent } from "../src/ui/Today";
class FakeWS { static all: FakeWS[] = []; readyState = 0; sent: any[] = []; onopen?: () => void; onmessage?: (e: any) => void; onclose?: () => void; onerror?: () => void;
  constructor(public url: string) { FakeWS.all.push(this); } send(m: string) { this.sent.push(JSON.parse(m)); } close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); } msg(o: object) { this.onmessage?.({ data: JSON.stringify(o) }); } }
describe("Hyperliquid WebSocket", () => {
  beforeEach(() => { FakeWS.all = []; vi.useFakeTimers(); }); afterEach(() => vi.useRealTimers());
  it("subscribes, routes candle ticks, reconnects with backoff, unsubscribes", () => {
    const doc = new EventTarget() as any; doc.hidden = false; const s = new HlSocket("wss://x", FakeWS as any, doc); const got: any[] = [];
    const off = s.subscribe({ type: "candle", coin: "BTC", interval: "4h" }, (d) => got.push(d));
    const w = FakeWS.all[0]; w.open(); expect(s.status).toBe("live"); expect(w.sent[0]).toEqual({ method: "subscribe", subscription: { type: "candle", coin: "BTC", interval: "4h" } });
    w.msg({ channel: "candle", data: { s: "BTC", i: "4h", t: 1, o: "1", h: "2", l: "0.5", c: "1.5", v: "3" } }); w.msg({ channel: "candle", data: { s: "ETH", i: "4h" } }); expect(got).toHaveLength(1);
    w.close(); expect(s.status).toBe("connecting"); vi.advanceTimersByTime(1300); expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1].open(); expect(FakeWS.all[1].sent[0].method).toBe("subscribe"); // re-subscribes after reconnect
    doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange")); expect(s.status).toBe("off"); // paused while hidden
    doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); expect(FakeWS.all).toHaveLength(3);
    FakeWS.all[2].open(); off(); expect(FakeWS.all[2].sent.at(-1).method).toBe("unsubscribe"); expect(s.status).toBe("off");
  });
});
describe("Bulk markets and price ticks", () => {
  it("lists only TRADING Bulk markets with their tick size", async () => {
    const f = (async () => new Response(JSON.stringify([{ symbol: "BTC-USD", status: "TRADING", tickSize: 0.01, pricePrecision: 2, maxLeverage: 40 }, { symbol: "AAVE-USD", status: "SUSPENDED", tickSize: 0.001 }, { symbol: "MON-USD", status: "TRADING", pricePrecision: 6, maxLeverage: 10 }]))) as any;
    const m = await listMarkets("bulk", f); expect(m.map((x) => x.symbol)).toEqual(["BTC-USD", "MON-USD"]); expect(m[0].tick).toBe(0.01); expect(m[1].tick).toBeCloseTo(1e-6);
  });
  it("rounds to tick; stops never tighten", () => {
    expect(roundTick(0.0312345, 1e-6)).toBe(0.031235); expect(roundTick(101.237, 0.01, "down")).toBe(101.23); expect(roundTick(101.231, 0.01, "up")).toBe(101.24);
    const c = Array.from({ length: 300 }, (_, i) => { const x = 0.03 + 0.0001 * Math.sin(i / 5) + i * 1e-6; return { t: i, o: x, h: x * 1.003, l: x * 0.997, c: x, v: 5 }; });
    const st = scan(c, "long", DEFAULTS); const r = roundSetup(st, (p, m) => roundTick(p, 1e-6, m));
    r.zones.forEach((z, i) => { expect(z.stop).toBeLessThanOrEqual(st.zones[i].stop + 1e-12); expect(Math.abs(z.entry * 1e6 - Math.round(z.entry * 1e6))).toBeLessThan(1e-6); });
  });
});
describe("Today", () => {
  it("countdown and next event", () => {
    expect(countdown(3_723_000)).toBe("1h 2m 03s"); expect(countdown(90_061_000)).toBe("1d 1h 1m"); expect(countdown(-5)).toBe("now");
    const ev = (title: string, time: string) => ({ title, time, forecast: null, previous: null, actual: null, source: "" });
    const n = nextEvent([ev("old", "2026-10-01T08:30:00-04:00"), ev("CPI m/m", "2026-10-14T08:30:00-04:00"), ev("CPI y/y", "2026-10-14T08:30:00-04:00"), ev("FOMC", "2026-10-28T14:00:00-04:00")], Date.parse("2026-10-13T12:00:00Z"));
    expect(n!.titles).toEqual(["CPI m/m", "CPI y/y"]);
  });
});
import { declutter, lineSpecs } from "../src/ui/chartLines";
describe("chart axis labels (regression: est. liq covering Entry top/bottom, BTC short 4H)", () => {
  const col = { accent: "a", neg: "n", pos: "p", warn: "w" };
  const setup: any = { dir: "short", price: 84000, zones: [null, { top: 85448.8, bottom: 85326.2, stop: 86100, t1: 82300, t2: 81000 }] };
  const analysis: any = { liq: [{ price: 85354, long: 0, short: 9 }, { price: 85600, long: 0, short: 5 }, { price: 88000, long: 0, short: 4 }] };
  const toY = (p: number) => 400 - (p - 80000) * 0.06; // ~0.06 px per $ → entry band is ~7px tall
  const out = declutter(lineSpecs(setup, 1, analysis, col), toY);
  const shown = out.filter((x) => x.label !== false);
  it("keeps every line but no two visible labels overlap", () => {
    expect(out).toHaveLength(8); const ys = shown.map((x) => toY(x.price)!).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(18);
  });
  it("trade levels win; liq inside the entry band loses its label", () => {
    expect(shown.map((x) => x.title)).toEqual(expect.arrayContaining(["Entry", "Stop", "TP1"]));
    expect(out.find((x) => x.price === 85354)!.label).toBe(false); expect(out.find((x) => x.price === 88000)!.label).toBe(true);
  });
  it("leaves labels alone when there's room", () => { const wide = declutter(lineSpecs(setup, 1, null, col), (p) => (90000 - p)); expect(wide.every((x) => x.label)).toBe(true); expect(wide[0].title).toBe("Entry top"); });
});
// @ts-ignore node builtin in tests
import { readFileSync } from "node:fs";
describe("zone card CSS (regression: Today's .kv override broke the zone grid)", () => {
  it("each class used by the zone card is defined once, as a row list", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css.match(/(^|[}\s])\.zkv\s*\{/g)).toHaveLength(1); expect(css).toMatch(/\.zkv \.zr\{display:flex;justify-content:space-between/);
    expect((css.match(/(^|[}\s])\.kv\s*\{/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
import { checkLiq, liqPrice, maxSafeLev, mmrFor } from "../src/engine/liq";
describe("your liquidation vs stop", () => {
  it("liq price and max safe leverage", () => {
    expect(mmrFor("hyperliquid", 40)).toBeCloseTo(0.0125); expect(mmrFor("binance")).toBe(0.005);
    expect(liqPrice(100, "long", 10, 0.01)).toBeCloseTo(91); expect(liqPrice(100, "short", 10, 0.01)).toBeCloseTo(109);
    // short at 85,000, stop 86,200 (1.41% away): 50× liquidates first; max safe ≈ floor(1/(0.0155+0.0125)) = 35
    const c = checkLiq({ entry: 85000, stop: 86200 }, "short", 50, 0.0125, 40); expect(c.beforeStop).toBe(true); expect(c.maxSafe).toBe(35);
    expect(checkLiq({ entry: 85000, stop: 86200 }, "short", c.maxSafe, 0.0125).beforeStop).toBe(false);
    expect(checkLiq({ entry: 85000, stop: 86200 }, "short", 5, 0.0125).beforeStop).toBe(false); expect(maxSafeLev(100, 50, 0.01)).toBe(1);
  });
  it("draws 'Your liq' only when passed, and labels market liq as other traders' zones", () => {
    const setup: any = { dir: "short", price: 84000, zones: [null, { top: 85448.8, bottom: 85326.2, stop: 86100, t1: 82300, t2: 81000 }] };
    const sp = lineSpecs(setup, 1, { liq: [{ price: 85700, long: 0, short: 3 }] } as any, { accent: "a", neg: "n", pos: "p", warn: "w" }, 85900);
    expect(sp.map((x) => x.title)).toEqual(expect.arrayContaining(["Your liq", "Shorts liq zone"])); expect(lineSpecs(setup, 1, null, { accent: "a", neg: "n", pos: "p", warn: "w" }).some((x) => x.title === "Your liq")).toBe(false);
  });
});
