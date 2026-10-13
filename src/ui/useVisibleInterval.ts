import { useEffect, useRef } from "react";
/** Runs fn now and every ms while the page is visible; pauses when hidden and refreshes on return. */
export function useVisibleInterval(fn: () => void, ms: number, deps: unknown[]) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null; let last = 0;
    const tick = () => { last = Date.now(); ref.current(); };
    const start = () => { if (t) return; if (Date.now() - last >= ms) tick(); t = setInterval(tick, ms); };
    const stop = () => { if (t) clearInterval(t); t = null; };
    const vis = () => (document.hidden ? stop() : start());
    tick(); if (!document.hidden) t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", vis); return () => { stop(); document.removeEventListener("visibilitychange", vis); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
