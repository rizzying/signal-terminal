import { describe, expect, it } from "vitest";
import { usd } from "../src/labs";
import { tradesCsv } from "../src/forward/paper.js";
describe("usd display", () => {
  it("R x risk", () => { expect(usd(0.59, 100)).toBe("+$59"); expect(usd(-3, 100)).toBe("-$300"); expect(usd(0, 100)).toBe("$0"); expect(usd(null, 100)).toBe("–"); expect(usd(3, 250)).toBe("+$750"); });
  it("csv keeps R and adds usd", () => { const c = tradesCsv([{ id: 1, market: "ETHUSDT", side: "long", status: "closed", exit_reason: "tp", r_net: 2.9, mfe: 3, mae: -0.5 } as any], 100).split("\n");
    expect(c[0].endsWith("r_net,mfe_r,mae_r,risk_usd,usd_net,mfe_usd,mae_usd")).toBe(true); expect(c[1].endsWith("2.9000,3.0000,-0.5000,100,290.00,300.00,-50.00")).toBe(true); });
});
