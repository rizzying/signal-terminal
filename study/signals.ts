// worker: compute walk-forward signals for one (asset, tf, strategy)
import { parentPort, workerData } from "node:worker_threads";
import { signalsAt } from "../src/engine/sim";
import { BUILTINS } from "../src/strategies";
const { candles, sid } = workerData; const s = BUILTINS.find((b) => b.id === sid)!.settings;
parentPort!.postMessage(signalsAt(candles, 300, s));
