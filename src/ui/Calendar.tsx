import { useEffect, useState } from "react";
type PM = { title: string; url: string; outcomes: { label: string; p: number }[]; volume: number | null };
export type CalEvent = { title: string; time: string; forecast: string | null; previous: string | null; actual: string | null; source: string; polymarket?: PM | null; pendingActual?: boolean };
type Cal = { month: string; generatedAt: string; events: CalEvent[]; notes: string[]; coverage: string };
const wib = (t: string, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", ...o });
const num = (s: string | null) => (s == null || s === "" ? null : parseFloat(s.replace(/[^\d.-]/g, "")));

/** Rule of thumb for crypto/risk assets. Not advice. */
export function ruleOfThumb(e: Pick<CalEvent, "title" | "forecast" | "actual">): { general: string; verdict?: "bullish" | "bearish" | "neutral" } {
  const t = e.title.toLowerCase(); const a = num(e.actual), f = num(e.forecast);
  const kind = /cpi|ppi|pce|inflation/.test(t) ? "infl" : /unemployment|jobless|claims/.test(t) ? "unemp" : /fomc|federal funds|rate decision/.test(t) ? "fomc" : /speaks|testif|press conference/.test(t) ? "speech" : "growth";
  const general = { infl: "Hotter than forecast → usually bearish (rates stay higher). Cooler → usually bullish.", unemp: "Higher than forecast → usually bullish (more room to cut). Lower → usually bearish.", fomc: "Cut or dovish guidance → usually bullish. Hike or hawkish → usually bearish. Moves often come from the press conference.", speech: "Dovish tone → usually bullish; hawkish tone → usually bearish. Expect volatility.", growth: "Much stronger than forecast → often bearish short-term (yields up). Weaker → often bullish via rate-cut hopes, unless it signals recession." }[kind];
  if (a == null || f == null || kind === "speech" || kind === "fomc") return { general };
  const d = a - f; if (Math.abs(d) < 1e-9) return { general, verdict: "neutral" };
  const up = d > 0; const verdict = kind === "unemp" ? (up ? "bullish" : "bearish") : up ? "bearish" : "bullish";
  return { general, verdict };
}

export function CalendarView() {
  const [cal, setCal] = useState<Cal | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/calendar").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setCal).catch(() => setErr("Couldn't load the calendar right now. Try again in a minute.")); }, []);
  const now = Date.now(); const month = cal ? new Date(`${cal.month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return (
    <section className="stack">
      <div className="card">
        <div className="cardhead"><h2>Economic calendar</h2><span className="lbl">{month} · US · high impact · times in WIB</span></div>
        {!cal && !err && <p className="dim">Loading…</p>}
        {err && <p className="note warn" role="alert">{err}</p>}
        {cal && <p className="dim small">{cal.coverage} {cal.notes.join(" ")}</p>}
        {cal && cal.events.some((e) => e.actual) && <p className="dim small">Actuals are computed from the official seasonally adjusted series on FRED; they can differ by a rounding step from the headline print.</p>}
        {cal && !cal.events.length && <p className="note">No high-impact US events found for this period.</p>}
      </div>
      {cal?.events.map((e, i) => { const r = ruleOfThumb(e); const past = Date.parse(e.time) < now;
        return (
          <article key={i} className={`card calev ${past ? "past" : ""}`}>
            <div className="cardhead"><h3>{e.title}</h3><span className="lbl mono">{wib(e.time, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} WIB</span></div>
            <div className="stats">
              <div><span className="lbl">Forecast</span><b className="mono">{e.forecast ?? "–"}</b></div>
              <div><span className="lbl">Previous</span><b className="mono">{e.previous ?? "–"}</b></div>
              <div><span className="lbl">Actual</span><b className="mono">{e.actual ?? (past ? (e.pendingActual ? "awaiting FRED" : "not available") : "pending")}</b></div>
            </div>
            {e.polymarket && <div className="pm"><span className="lbl">Polymarket odds · <a href={e.polymarket.url} target="_blank" rel="noopener noreferrer">{e.polymarket.title}</a></span>
              <ul className="pmlist">{e.polymarket.outcomes.map((o) => <li key={o.label}><span>{o.label}</span><span className="bar" aria-hidden><i style={{ width: `${Math.round(o.p * 100)}%` }} /></span><b className="mono">{Math.round(o.p * 100)}%</b></li>)}</ul></div>}
            <p className="small"><span className="badge">rule of thumb, not advice</span> {r.verdict && <b className={r.verdict === "bullish" ? "pos" : r.verdict === "bearish" ? "neg" : ""}>{r.verdict} vs forecast · </b>}<span className="dim">{r.general}</span></p>
            <p className="dim small">Source: {e.source}</p>
          </article>
        ); })}
    </section>
  );
}
