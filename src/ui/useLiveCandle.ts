import { useEffect, useState } from "react";
import { candles, type Exchange, type TF } from "../api/markets";
import { hlSocket, wsCandle, type LiveStatus } from "../api/live";
import type { Candle } from "../engine/indicators";
import { useVisibleInterval } from "./useVisibleInterval";
/** Latest (forming) candle: Hyperliquid via WebSocket, otherwise (or while the socket is down) polled every 15s. */
export function useLiveCandle(ex: Exchange, sym: string, tf: TF, enabled = true): { candle: Candle | null; mode: "live" | "polling" } {
  const [candle, setCandle] = useState<Candle | null>(null); const [ws, setWs] = useState<LiveStatus>("off");
  useEffect(() => { setCandle(null); if (!enabled || ex !== "hyperliquid" || !sym) return;
    const s = hlSocket(); const off1 = s.onStatus(setWs); const off2 = s.subscribe({ type: "candle", coin: sym, interval: tf }, (d) => setCandle(wsCandle(d)));
    return () => { off1(); off2(); setWs("off"); }; }, [ex, sym, tf, enabled]);
  const live = ex === "hyperliquid" && ws === "live";
  useVisibleInterval(() => { if (!enabled || live || !sym) return; candles(ex, sym, tf, 2).then((c) => { const k = c.at(-1); if (k) setCandle(k); }).catch(() => {}); }, 15_000, [ex, sym, tf, enabled, live]);
  return { candle, mode: live ? "live" : "polling" };
}
