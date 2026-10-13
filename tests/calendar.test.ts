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
    expect(fomcDates("<h4>2026 FOMC Meetings</h4><p>October 27-28</p><p>December 8-9*</p><h4>2025 FOMC Meetings</h4>March 1-2", 2026)).toEqual(["2026-10-28T14:00:00-04:00", "2026-12-09T14:00:00-04:00"]);
    expect(pmQuery("Core CPI m/m", "2026-10-14T08:30:00-04:00")).toBe("core cpi mom september");
    expect(pmQuery("FOMC rate decision", "2026-10-28T14:00:00-04:00")).toBe("fed decision october");
  });
});
