import { runWith, type BtInput } from "./backtest";
import { signalsAt, type BarSig } from "./sim";
let sig: BarSig[] | null = null; let inp: BtInput | null = null;
self.onmessage = (e: MessageEvent<any>) => {
  const post = (m: unknown) => (self as any).postMessage(m);
  try {
    const d = e.data;
    if (d.type === "signals") { inp = d.input; sig = signalsAt(d.input.candles, d.input.startIdx, d.input.settings, 300, (p) => post({ progress: p })); post({ ready: true }); return; }
    if (d.type === "run" && inp && sig) { post({ result: runWith({ ...inp, ...d.patch }, sig, d.resolved, d.split) }); return; }
    post({ error: "Backtest worker not ready." });
  } catch (err) { post({ error: String((err as Error).message ?? err) }); }
};
