import { getLabs, setLabs } from "../src/labs";
it("Labs: backtest off by default, stored on device", () => {
  localStorage.clear(); expect(getLabs().backtest).toBe(false);
  setLabs({ backtest: true }); expect(JSON.parse(localStorage.getItem("sig.labs")!)).toEqual({ backtest: true }); expect(getLabs().backtest).toBe(true);
  localStorage.setItem("sig.labs", "{bad"); expect(getLabs().backtest).toBe(false);
});
