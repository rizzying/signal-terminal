// Vercel serverless function (Hobby/free). Fetches PUBLIC data only and caches it at the edge.
// Sources: ForexFactory weekly JSON (this week only), federalreserve.gov FOMC calendar, Polymarket Gamma API.
const FF = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FED = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const GAMMA = "https://gamma-api.polymarket.com";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const UA = { "user-agent": "Mozilla/5.0 (Signal terminal; public calendar)" };
const j = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

// ---- FRED (server-side key only; never sent to the browser) ----
const FRED = "https://api.stlouisfed.org/fred";
// Official release schedules (BLS/BEA via FRED's release calendar) → FF-style titles and how to compute the actual.
export const RELEASES = {
  10: { src: "BLS", et: [8, 30], ev: [["CPI m/m", "CPIAUCSL", "mom"], ["CPI y/y", "CPIAUCSL", "yoy"], ["Core CPI m/m", "CPILFESL", "mom"], ["Core CPI y/y", "CPILFESL", "yoy"]] },
  50: { src: "BLS", et: [8, 30], ev: [["Non-Farm Employment Change", "PAYEMS", "diffK"], ["Unemployment Rate", "UNRATE", "level"]] },
  46: { src: "BLS", et: [8, 30], ev: [["PPI m/m", "PPIFIS", "mom"], ["Core PPI m/m", "PPIFES", "mom"]] },
  9: { src: "Census", et: [8, 30], ev: [["Retail Sales m/m", "RSAFS", "mom"], ["Core Retail Sales m/m", "RSFSXMV", "mom"]] },
  53: { src: "BEA", et: [8, 30], ev: [["GDP q/q (annualised)", "A191RL1Q225SBEA", "level"]] },
  54: { src: "BEA", et: [8, 30], ev: [["Core PCE Price Index m/m", "PCEPILFE", "mom"]] },
  192: { src: "BLS", et: [10, 0], ev: [["JOLTS Job Openings", "JTSJOL", "levelM"]] },
};
export function etIso(date, h, m) { // wall-clock time in New York → ISO with the right offset (EDT -04 / EST -05)
  const noon = new Date(`${date}T16:00:00Z`); const tz = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(noon).find((p) => p.type === "timeZoneName").value; // "GMT-4"
  const off = Math.abs(parseInt(tz.replace("GMT", ""), 10) || 5);
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-${String(off).padStart(2, "0")}:00`;
}
export function actualFrom(obs, how) { // obs newest first, numbers
  const v = obs.map((o) => +o.value).filter((x) => Number.isFinite(x)); if (v.length < 2) return null;
  const pct = (a, b) => `${(((a - b) / b) * 100).toFixed(1)}%`;
  if (how === "mom") return pct(v[0], v[1]); if (how === "yoy") return v.length >= 13 ? pct(v[0], v[12]) : null;
  if (how === "diffK") return `${Math.round(v[0] - v[1])}K`; if (how === "levelM") return `${(v[0] / 1000).toFixed(2)}M`; return `${v[0].toFixed(1)}%`;
}
async function fredEvents(key, ym, now) {
  const end = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
  const d = await j(`${FRED}/releases/dates?api_key=${key}&file_type=json&realtime_start=${ym}-01&realtime_end=${end}&include_release_dates_with_no_data=true&limit=1000`);
  const out = [];
  for (const rd of d.release_dates || []) { const R = RELEASES[rd.release_id]; if (!R || rd.date.slice(0, 7) !== ym) continue; const time = etIso(rd.date, ...R.et);
    for (const [title, series, how] of R.ev) out.push({ title, time, forecast: null, previous: null, actual: null, source: `${R.src} schedule via FRED`, _s: series, _how: how, _date: rd.date }); }
  await Promise.all(out.map(async (e) => {
    try { // vintage as of the release date: the newest observation must have been published that day
      const past = e._date <= new Date(now).toISOString().slice(0, 10); const rt = past ? `&realtime_start=${e._date}&realtime_end=${e._date}` : "";
      const o = await j(`${FRED}/series/observations?api_key=${key}&file_type=json&series_id=${e._s}&sort_order=desc&limit=14${rt}`);
      const obs = o.observations || []; const fresh = past && obs[0]?.realtime_start === e._date;
      if (Date.parse(e.time) < now && fresh) { e.actual = actualFrom(obs, e._how); e.previous = actualFrom(obs.slice(1), e._how); }
      else { const prior = fresh ? obs.slice(1) : obs; e.previous = actualFrom(prior, e._how); }
      if (Date.parse(e.time) < now && !e.actual) e.pendingActual = true;
    } catch { /* leave blank */ }
    delete e._s; delete e._how; delete e._date;
  }));
  return out;
}

export function fomcDates(html, year) {
  const i = html.indexOf(`${year} FOMC Meetings`); if (i < 0) return [];
  const k = html.indexOf(`${year - 1} FOMC Meetings`, i); const txt = html.slice(i, k > 0 ? k : i + 40000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const out = []; const re = new RegExp(`(${MONTHS.join("|")})(?:/(${MONTHS.join("|")}))? (\\d{1,2})-(\\d{1,2})`, "g"); let m;
  while ((m = re.exec(txt))) { const mon = MONTHS.indexOf(m[2] || m[1]); const day = +m[4];
    out.push(etIso(`${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, 14, 0)); } // decision 2:00 pm New York time
  return [...new Set(out)];
}
// FF title → Polymarket search phrase
export function pmQuery(title, date) {
  const mon = MONTHS[(new Date(date).getUTCMonth() + 11) % 12].toLowerCase(); const t = title.toLowerCase();
  if (t.includes("fomc") || t.includes("federal funds rate") || t.includes("fed decision")) return `fed decision ${MONTHS[new Date(date).getUTCMonth()].toLowerCase()}`;
  if (/core cpi m\/m/.test(t)) return `core cpi mom ${mon}`; if (/core cpi y\/y/.test(t)) return `core cpi yoy ${mon}`;
  if (/^cpi m\/m/.test(t)) return `cpi mom ${mon}`; if (/^cpi y\/y/.test(t)) return `cpi yoy ${mon}`;
  if (t.includes("non-farm") || t.includes("nonfarm")) return `jobs report ${mon}`; if (t.includes("unemployment rate")) return `unemployment ${mon}`;
  if (t.includes("advance gdp") || t === "gdp q/q") return "gdp growth"; if (t.includes("pce")) return `pce ${mon}`;
  return null;
}
async function polymarket(q, eventTime) {
  const d = await j(`${GAMMA}/public-search?q=${encodeURIComponent(q)}&limit_per_type=10&events_status=active`);
  const t = Date.parse(eventTime); const words = q.split(" ");
  const ev = (d.events || []).filter((e) => !e.closed && words.every((w) => e.slug.includes(w)) && (q.startsWith("core") || !e.slug.includes("core")) && Math.abs(Date.parse(e.endDate) - t) < 4 * 864e5)[0];
  if (!ev) return null;
  const full = (await j(`${GAMMA}/events?slug=${encodeURIComponent(ev.slug)}`))[0] || ev;
  const outcomes = (full.markets || []).filter((m) => !m.closed).map((m) => ({ label: m.groupItemTitle || m.question, p: +JSON.parse(m.outcomePrices || "[0]")[0] })).sort((a, b) => b.p - a.p).slice(0, 4);
  return { title: full.title, url: `https://polymarket.com/event/${ev.slug}`, outcomes, volume: +full.volume || null };
}
export default async function handler(req, res) {
  const now = new Date(); const ym = now.toISOString().slice(0, 7); const notes = [];
  let ff = [], fomc = [];
  try { ff = (await j(FF)).filter((e) => e.country === "USD" && e.impact === "High"); } catch (e) { notes.push("ForexFactory feed unavailable right now."); }
  try { const h = await (await fetch(FED, { headers: UA })).text(); fomc = fomcDates(h, now.getUTCFullYear()); } catch { notes.push("Fed calendar unavailable right now."); }
  const key = process.env.FRED_API_KEY; let fred = [];
  if (key) { try { fred = await fredEvents(key, ym, now.getTime()); } catch { notes.push("FRED release calendar unavailable right now; showing this week's ForexFactory events only."); } }
  else notes.push("Full-month dates and actuals need the FRED_API_KEY server setting; showing this week's ForexFactory events only.");
  const norm = (t) => t.toLowerCase().replace(/[^a-z/]/g, "");
  const events = fred;
  for (const e of ff) { const m = events.find((x) => x.time.slice(0, 10) === e.date.slice(0, 10) && (norm(x.title) === norm(e.title) || norm(x.title).startsWith(norm(e.title))));
    if (m) { m.forecast = e.forecast || null; m.previous = e.previous || m.previous; m.source += " · forecast: ForexFactory"; }
    else events.push({ title: e.title, time: e.date, forecast: e.forecast || null, previous: e.previous || null, actual: e.actual || null, source: "ForexFactory" }); }
  for (const d of fomc) if (d.slice(0, 7) === ym && !events.some((e) => /fomc|federal funds/i.test(e.title) && e.time.slice(0, 10) === d.slice(0, 10)))
    events.push({ title: "FOMC rate decision", time: d, forecast: null, previous: null, actual: null, source: "federalreserve.gov" });
  await Promise.all(events.map(async (e) => { const q = pmQuery(e.title, e.time); if (!q) return; try { e.polymarket = await polymarket(q, e.time); } catch { /* optional */ } }));
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).json({ month: ym, generatedAt: now.toISOString(), events, notes,
    coverage: key ? "Dates for the whole month come from the official BLS/BEA/Census release schedules (via FRED) and the Fed's FOMC calendar. Actuals come from FRED once published, computed from the official series (seasonally adjusted, so they can differ slightly from headline rounding). Forecasts come from ForexFactory and only cover the current week." : "ForexFactory's free feed only covers the current week, so other weeks show FOMC dates only. The free feed has no actual values." });
}
