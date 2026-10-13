// Vercel serverless function (Hobby/free). Fetches PUBLIC data only and caches it at the edge.
// Sources: ForexFactory weekly JSON (this week only), federalreserve.gov FOMC calendar, Polymarket Gamma API.
const FF = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const FED = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const GAMMA = "https://gamma-api.polymarket.com";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const UA = { "user-agent": "Mozilla/5.0 (Signal terminal; public calendar)" };
const j = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

export function fomcDates(html, year) {
  const i = html.indexOf(`${year} FOMC Meetings`); if (i < 0) return [];
  const k = html.indexOf(`${year - 1} FOMC Meetings`, i); const txt = html.slice(i, k > 0 ? k : i + 40000).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const out = []; const re = new RegExp(`(${MONTHS.join("|")})(?:/(${MONTHS.join("|")}))? (\\d{1,2})-(\\d{1,2})`, "g"); let m;
  while ((m = re.exec(txt))) { const mon = MONTHS.indexOf(m[2] || m[1]); const day = +m[4];
    out.push(`${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T14:00:00-04:00`); } // decision 2:00 pm ET (EDT; EST months shift by an hour)
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
  const events = ff.map((e) => ({ title: e.title, time: e.date, forecast: e.forecast || null, previous: e.previous || null, actual: e.actual || null, source: "ForexFactory" }));
  for (const d of fomc) if (d.slice(0, 7) === ym && !events.some((e) => /fomc|federal funds/i.test(e.title) && e.time.slice(0, 10) === d.slice(0, 10)))
    events.push({ title: "FOMC rate decision", time: d, forecast: null, previous: null, actual: null, source: "federalreserve.gov" });
  await Promise.all(events.map(async (e) => { const q = pmQuery(e.title, e.time); if (!q) return; try { e.polymarket = await polymarket(q, e.time); } catch { /* optional */ } }));
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).json({ month: ym, generatedAt: now.toISOString(), events, notes,
    coverage: "ForexFactory's free feed only covers the current week, so other weeks of the month show FOMC dates from federalreserve.gov only. The free feed has no 'actual' values." });
}
