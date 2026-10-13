import { backtest, type BtInput } from "./backtest";
self.onmessage = (e: MessageEvent<BtInput>) => {
  try { const r = backtest(e.data, (p) => (self as any).postMessage({ progress: p })); (self as any).postMessage({ result: r }); }
  catch (err) { (self as any).postMessage({ error: String((err as Error).message ?? err) }); }
};
