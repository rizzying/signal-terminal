declare const process: any;
import { ruleOfThumb } from "../src/ui/Calendar";
// @ts-ignore plain JS serverless function
import { fomcDates, pmQuery } from "../api/calendar.js";
describe("calendar", () => {
  it("rule of thumb", () => {
    expect(ruleOfThumb({ title: "CPI m/m", forecast: "0.3%", actual: "0.5%" }).verdict).toBe("bearish");
    expect(ruleOfThumb({ title: "Unemployment Rate", forecast: "4.1%", actual: "4.3%" }).verdict).toBe("bullish");
    expect(ruleOfThumb({ title: "CPI m/m", forecast: "0.3%", actual: null }).verdict).toBeUndefined();
  });
  it("parses FOMC dates and maps Polymarket queries", () => {
    expect(fomcDates("<h4>2026 FOMC Meetings</h4><p>October 27-28</p><p>December 8-9*</p><h4>2025 FOMC Meetings</h4>March 1-2", 2026)).toEqual(["2026-10-28T14:00:00-04:00", "2026-12-09T14:00:00-05:00"]);
    expect(pmQuery("Core CPI m/m", "2026-10-14T08:30:00-04:00")).toBe("core cpi mom september");
    expect(pmQuery("FOMC rate decision", "2026-10-28T14:00:00-04:00")).toBe("fed decision october");
  });
});
// @ts-ignore plain JS
import { actualFrom, etIso, default as handler } from "../api/calendar.js";
describe("FRED calendar helpers", () => {
  it("New York offsets", () => { expect(etIso("2026-10-14", 8, 30)).toBe("2026-10-14T08:30:00-04:00"); expect(etIso("2026-12-09", 14, 0)).toBe("2026-12-09T14:00:00-05:00"); });
  it("actuals from observations", () => {
    const o = (xs: number[]) => xs.map((v) => ({ value: String(v) }));
    expect(actualFrom(o([101, 100]), "mom")).toBe("1.0%"); expect(actualFrom(o([159500, 159400]), "diffK")).toBe("100K");
    expect(actualFrom(o([4.25, 4.1]), "level")).toBe("4.3%"); expect(actualFrom(o([7200, 7000]), "levelM")).toBe("7.20M");
  });
  it("degrades without FRED_API_KEY", async () => {
    const k = process.env.FRED_API_KEY; delete process.env.FRED_API_KEY; const real = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("offline"); }) as any; let out: any;
    await handler({}, { setHeader() {}, status() { return this; }, json(x: any) { out = x; } });
    globalThis.fetch = real; if (k) process.env.FRED_API_KEY = k;
    expect(out.notes.join(" ")).toMatch(/FRED_API_KEY/); expect(out.events).toEqual([]);
  });
});
