// Hyperliquid public WebSocket (free, no key): live candles and mid prices.
// One shared socket; reconnects with backoff; closes while the page is hidden; callers fall back to polling when it's down.
import type { Candle } from "../engine/indicators";
export const HL_WS = "wss://api.hyperliquid.xyz/ws";
type Sub = { type: "candle"; coin: string; interval: string } | { type: "allMids" };
type Listener = (data: any) => void;
const keyOf = (s: Sub) => (s.type === "candle" ? `candle|${s.coin}|${s.interval}` : "allMids");
export type LiveStatus = "live" | "connecting" | "off";

export class HlSocket {
  private ws: WebSocket | null = null; private subs = new Map<string, { sub: Sub; ls: Set<Listener> }>(); private retry = 0; private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null; private statusLs = new Set<(s: LiveStatus) => void>(); status: LiveStatus = "off"; private hidden = false;
  constructor(private url = HL_WS, private Ctor: typeof WebSocket | undefined = typeof WebSocket !== "undefined" ? WebSocket : undefined, doc: Document | undefined = typeof document !== "undefined" ? document : undefined) {
    doc?.addEventListener("visibilitychange", () => { this.hidden = doc.hidden; if (doc.hidden) this.close(); else this.ensure(); });
  }
  private set(s: LiveStatus) { this.status = s; this.statusLs.forEach((f) => f(s)); }
  onStatus(f: (s: LiveStatus) => void) { this.statusLs.add(f); f(this.status); return () => this.statusLs.delete(f); }
  subscribe(sub: Sub, l: Listener) {
    const k = keyOf(sub); let e = this.subs.get(k); if (!e) { e = { sub, ls: new Set() }; this.subs.set(k, e); this.send({ method: "subscribe", subscription: sub }); }
    e.ls.add(l); this.ensure();
    return () => { const x = this.subs.get(k); if (!x) return; x.ls.delete(l); if (!x.ls.size) { this.subs.delete(k); this.send({ method: "unsubscribe", subscription: sub }); if (!this.subs.size) this.close(); } };
  }
  private send(m: object) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  private ensure() {
    if (this.ws || this.timer || this.hidden || !this.subs.size || !this.Ctor) return;
    this.set("connecting"); let ws: WebSocket; try { ws = new this.Ctor(this.url); } catch { return this.later(); } this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.set("live"); for (const { sub } of this.subs.values()) this.send({ method: "subscribe", subscription: sub }); this.ping = setInterval(() => this.send({ method: "ping" }), 45_000); };
    ws.onmessage = (ev) => { let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.channel === "candle" && m.data) { const d = m.data; this.subs.get(`candle|${d.s}|${d.i}`)?.ls.forEach((f) => f(d)); }
      else if (m.channel === "allMids" && m.data?.mids) this.subs.get("allMids")?.ls.forEach((f) => f(m.data.mids)); };
    ws.onclose = () => { this.cleanup(); if (!this.hidden && this.subs.size) this.later(); else this.set("off"); };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }
  private later() { this.set("connecting"); const wait = Math.min(30_000, 1000 * 2 ** this.retry++) * (0.8 + Math.random() * 0.4); this.timer = setTimeout(() => { this.timer = null; this.ensure(); }, wait); }
  private cleanup() { if (this.ping) clearInterval(this.ping); this.ping = null; this.ws = null; }
  close() { if (this.timer) clearTimeout(this.timer); this.timer = null; const w = this.ws; this.cleanup(); if (w) { w.onclose = null; try { w.close(); } catch { /* ignore */ } } this.set("off"); }
}
let shared: HlSocket | null = null;
export const hlSocket = () => (shared ??= new HlSocket());
export const wsCandle = (d: any): Candle => ({ t: d.t, o: +d.o, h: +d.h, l: +d.l, c: +d.c, v: +d.v });
