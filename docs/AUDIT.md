# Signal audit (v2.4, 2026-10-13)

Covers correctness, edge cases, security, accessibility, mobile, performance and code health. Everything under "Fixed" shipped in v2.4 (commit 1f481d1). These fixes are bug fixes and efficiency work; the product behaves the same apart from the alerts fix described below.

## Before → after
| Metric | v2.3 | v2.4 |
|---|---|---|
| JS on first load (gzip) | 136.7 KB in one file | 120.5 KB, split into app 23.6 + React 45.2 + charts 51.7 |
| JS on first load (raw) | 426 KB | 367 KB. Other tabs load on demand: Journal 17, Backtest 19, Market 7, Settings 6, Wallets 5, Watchlist 4, Calendar 4 KB. |
| Lighthouse mobile (perf / a11y / best practices) | 86 / 100 / 100 | **96** / 100 / 100 |
| Lighthouse desktop | 100 / 100 / 100 | 100 / 100 / 100 |
| Layout shift (CLS), mobile | **0.256** (fails the 0.1 target) | **0.001** |
| Mobile FCP / LCP / TBT | 1.5 s / 1.8 s / 20 ms | 1.5 s / 2.7 s / 50 ms (see note) |
| Page weight (Lighthouse) | 534 KiB | 495 KiB |
| Scan tab: requests in the first ~8 s (playwright, 390 px) | 3 external, 0 duplicates | 3 external, 0 duplicates |
| Funding / Positioning / Wallets polling when the tab is hidden | Every 30–60 s, forever | Paused; refreshes when you come back |

Note on mobile LCP: the app now waits for saved settings (IndexedDB, a few milliseconds) before the first scan. This avoids scanning twice and stops the layout jump, but the chart is now the largest paint and arrives a little later in Lighthouse's throttled run. The overall score still went up 10 points. Lighthouse runs vary by about ±0.3 s.

## Fixed in v2.4
**Correctness**
1. **Price alerts missed quick wicks.** The watcher only checked the price at that moment every 20 s, so a wick through a zone between checks never fired. It now checks the high and low of 1-minute candles since the alert was created (the last 30 minutes). (`hitsRange`, tests added.)
2. **Funding and Positioning race.** Switching assets quickly could let the old asset's late response overwrite the new one. Positioning also had unhandled promise rejections. Both now ignore stale responses and catch errors.
3. **Watchlist with a symbol not on the exchange** used to show a cryptic `Cannot read properties of undefined`. It now says "No candles: not listed on this exchange?" or "Only N candles".
4. **Hyperliquid unknown symbol** returns HTTP 500 with body `null`. That used to be retried three times (about 7 s) before a generic error. Now it fails at once with "Not listed on Hyperliquid".
5. **The OI chip said "(n/a)" while it was still loading.** It now shows that only when OI is really unavailable.

**Edge cases and resilience**
6. Every exchange request now has a **15 s timeout**. Before, a hanging API left "Loading…" forever.
7. **Identical in-flight requests are merged.** Two panels asking for the same URL at the same moment now make one call.
8. **Clearer errors:** "rate-limiting, try again in a minute" for 429s; the exchange's own message for 400/404 (e.g. "Invalid symbol"); "offline, slow or blocked" for network failures.
9. **Polling pauses while the tab is hidden** (Funding and Positioning every 60 s, Wallets every 30 s) and refreshes immediately when you return. Price alerts deliberately keep running, because notifications are their purpose.
10. **The calendar function** now has 8 s timeouts on each source, so one slow site can't hang the whole response.

**Security**
11. **CSP:** removed `'unsafe-inline'` from `script-src` and replaced it with the SHA-256 hash of the one inline theme script. Added `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `worker-src 'self'` and `manifest-src 'self'`. Verified live: the light theme still applies with no CSP errors. HSTS is already sent by Vercel.
12. **FRED key:** the calendar function now masks `api_key=` in any error text, so the key can't appear in logs or responses. Checked: the key is not in the client bundle and not in `/api/calendar` output. Reads stay server-side only.
13. **Inputs:** no `innerHTML`, `dangerouslySetInnerHTML` or `eval` anywhere. Imports parse JSON/CSV into typed fields, and React escapes all text.

**Performance**
14. **Code-splitting:** every tab except Scan is lazy-loaded. The chart library and React are in separate long-cached chunks, so a deploy that only touches app code no longer re-downloads 300 KB.
15. **Layout shift fixed** (0.256 → 0.001). There were three causes: the chart header wrapped while "Loading…" was wider than the price; the footer jumped up before content rendered; and a double render with default settings.
16. **No double scan on start:** settings and the active strategy load from IndexedDB before the first scan.
17. **PWA cache:**
    - The cache name is stamped per build, so old asset versions are deleted after each deploy. They used to pile up forever under a fixed name.
    - Only successful responses are cached. It used to cache 404/500 pages too.
    - `/api/` is never cached by the service worker.

**Code health**
18. Removed dead code (`hlInside`, a duplicate of the magnifier cache). `tsc --noUnusedLocals` is now clean apart from two unused props (left alone; harmless).
19. Tests: 60 → **66**. New ones cover request merging, the not-listed fast path, 4xx messages, wick-aware alerts, and polling that pauses while hidden and stops on unmount.

## Checked and found OK (no change)
- **Chart memory:** every `createChart` has a matching `remove()` (Scan, Backtest results, Monte Carlo fan). Every `addEventListener` in hooks is removed on unmount. The backtest worker is terminated after each run.
- **IndexedDB:** a single cached connection, a `kv` store plus a `trades` store, nothing heavy at startup.
- **Rate limits:** a per-exchange token bucket (Hyperliquid 4/s, burst 10) plus backoff on 429/5xx. Magnifier fetches are grouped (one request covers up to 4,500 small candles).
- **Vercel function caching:** `s-maxage=900, stale-while-revalidate=3600`. Confirmed served from cache (`x-vercel-cache: HIT`).
- **Web worker:** used for the backtest. The scan engine runs in roughly 5–30 ms on the main thread, so a worker isn't needed for it.
- **Accessibility:** axe (WCAG 2 A/AA) is clean on every tab at 5 widths in light and dark (80 page loads). Lighthouse accessibility is 100.
- **Wording:** consistent use of TP1/TP2, R:R, "Hyperliquid" and WIB times. No "HL" abbreviations in the UI.
- **Engine and costs:** the zone, cost and R:R maths is covered by the existing engine tests, and there's a test that the backtest doesn't use future data.

## Bigger improvements that need rizzy's decision
| # | Idea | Plain explanation | Effort |
|---|---|---|---|
| 1 | **Live prices over WebSocket** | Hyperliquid's free WebSocket (`wss://api.hyperliquid.xyz/ws`) could stream the last price and candles instead of re-fetching. That gives a ticking chart and instant alerts with fewer requests. It needs the CSP updated, reconnect logic and a battery-aware pause. | M |
| 2 | **Alerts when Signal is closed** | Today alerts only work while the app is open. Real push needs a small server or cron (e.g. a Vercel cron job checking every minute) plus Web Push keys. That's still free on Hobby with limits, but it means storing alert levels server-side, which is a privacy trade-off. | L |
| 3 | **Faster first chart on mobile** | Show cached candles from the last visit instantly (IndexedDB) and refresh in the background. That would cut LCP by about 1 s. It's a small behaviour change: candles that are briefly stale before the refresh lands. | S–M |
| 4 | **One "Today" home screen** | Combine Scan, top Watchlist movers, the next calendar event and active alerts into one first screen. That's fewer taps for the daily routine. | M |
| 5 | **Watchlist auto-refresh and "new setup" badge** | Rescan the watchlist every N minutes while it's open and highlight setups that just appeared. | S |
| 6 | **Journal sync or backup** | The journal only lives on this device today. An optional export to Google Drive or iCloud via the file picker, or an encrypted sync, would protect against losing a phone. | M |
| 7 | **Trim fonts** | Geist ships 12 subset files. Only Latin is needed for the UI, so limiting the `@font-face` ranges saves about 100 KB from the cache. Font files only download when they're used, so the first-load gain is small. | S |
| 8 | **Settings write debounce** | Every slider move writes to IndexedDB. A 300 ms debounce would be tidier; it's harmless today. | S |
| 9 | **Error reporting** | No telemetry today (good for privacy). An opt-in, anonymous error counter would show real-world API failures. | S |
| 10 | **Lint in CI** | Add ESLint (react-hooks rules) and a GitHub Action that runs the tests and the build on every push. | S |
