import { getLabs, setLabs, labAllowed } from "../src/labs";
it("Labs: backtest and forward off by default, stored on device", () => {
  localStorage.clear(); expect(getLabs()).toEqual({ backtest: false, forward: false });
  setLabs({ backtest: true, forward: false }); expect(JSON.parse(localStorage.getItem("sig.labs")!)).toEqual({ backtest: true, forward: false }); expect(getLabs().backtest).toBe(true);
  localStorage.setItem("sig.labs", '{"backtest":true}'); expect(getLabs().forward).toBe(false);
  localStorage.setItem("sig.labs", "{bad"); expect(getLabs().backtest).toBe(false);
});
it("Labs gates the Forward test and Backtest tabs", () => {
  const off = { backtest: false, forward: false };
  expect(labAllowed("forward", off)).toBe(false); expect(labAllowed("backtest", off)).toBe(false); expect(labAllowed("scan", off)).toBe(true);
  expect(labAllowed("forward", { backtest: false, forward: true })).toBe(true);
  expect(labAllowed("backtest", { backtest: true, forward: false })).toBe(true);
});
