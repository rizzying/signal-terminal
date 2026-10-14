import { useEffect, useRef, useState } from "react";
import { candles, TF_MS, type Exchange, type TF } from "../api/markets";
import { bulkTicker, hlSocket, tickCandle, wsCandle, type LiveStatus } from "../api/live";
import type { Candle } from "../engine/indicators";
import { useVisibleInterval } from "./useVisibleInterval";
/** Latest (forming) candle. Hyperliquid: candle WebSocket. Bulk: built from Bulk's ticker WebSocket (its candle feed runs 1–2 candles late).
 *  Otherwise, or while a socket is down: polled every 15s. */
export function useLiveCandle(ex: Exchange, sym: string, tf: TF, enabled = true): { candle: Candle | null; mode: "live" | "polling" } {
  const [candle, setCandle] = useState<Candle | null>(null); const [ws, setWs] = useState<LiveStatus>("off"); const seed = useRef<Candle | undefined>();
  useEffect(() => { setCandle(null); seed.current = undefined; if (!enabled || !sym) return;
    if (ex === "hyperliquid") { const s = hlSocket(); const off1 = s.onStatus(setWs); const off2 = s.subscribe({ type: "candle", coin: sym, interval: tf }, (d) => setCandle(wsCandle(d)));
      return () => { off1(); off2(); setWs("off"); }; }
    if (ex === "bulk") { let live = true; candles(ex, sym, tf, 2).then((c) => { if (live) seed.current = c.at(-1); }).catch(() => {});
      const s = bulkTicker(); const off1 = s.onStatus(setWs); const off2 = s.subscribe(sym, (px, now) => setCandle((p) => tickCandle(p, seed.current, px, now, TF_MS[tf])));
      return () => { live = false; off1(); off2(); setWs("off"); }; }
  }, [ex, sym, tf, enabled]);
  const live = (ex === "hyperliquid" || ex === "bulk") && ws === "live";
  useVisibleInterval(() => { if (!enabled || live || !sym) return; candles(ex, sym, tf, 2).then((c) => { const k = c.at(-1); if (k) setCandle(k); }).catch(() => {}); }, 15_000, [ex, sym, tf, enabled, live]);
  return { candle, mode: live ? "live" : "polling" };
}
