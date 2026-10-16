// Scorecard catalog for the v3.2 forward test. One list, headline first.
// The trader, the hourly job, the API and the page all derive from this.
export const MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
export const TFS = ["15m", "1h", "4h"];
export const ZONES = [1, 2, 3];
/** Bar length in ms. Expiry is 24 of these bars, per scorecard. */
export const TF_MS = { "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "4h": 4 * 60 * 60 * 1000 };
export const TF_INTERVAL = { "15m": "15m", "1h": "1h", "4h": "4h" };
export const TF_LABEL = { "15m": "15m", "1h": "1H", "4h": "4H" };
/** Frozen v3.0 book. Past trades stay on this id. The job does not open new ones. */
export const LEGACY_ID = "bn-1h-z2-v1";
export const LEGACY_HASH = "b81ceeeb";
export const HEADLINE_ID = "bn-1h-z2-v2";
/** FNV-1a of each live spec in trader.ts. A test fails if these drift. */
export const BOOK_HASH = {
  "bn-1h-z2-v2": "c376e7f0",
  "bn-15m-z1-v2": "b3fe341b",
  "bn-15m-z2-v2": "ce81efb4",
  "bn-15m-z3-v2": "992bd3dd",
  "bn-1h-z1-v2": "26142cad",
  "bn-1h-z3-v2": "050a3327",
  "bn-4h-z1-v2": "f75613b0",
  "bn-4h-z2-v2": "388f4e05",
  "bn-4h-z3-v2": "7307de0e",
};
export const strategyId = (tf, zone, version = "2") => `bn-${tf}-z${zone}-v${version}`;
const row = (tf, zone, extra) => ({ tf, zone, id: strategyId(tf, zone), name: `Binance ${TF_LABEL[tf]} Zone ${zone}`, headline: false, legacy: false, ...extra });
/**
 * Live v2 books. Headline (Binance spot 1H Zone 2) is first, then 15m Z1–Z3,
 * the other 1H zones, then 4H. Nine books, never blended.
 */
export function liveBooks() {
  const rest = [];
  for (const tf of TFS) for (const zone of ZONES) {
    if (tf === "1h" && zone === 2) continue;
    rest.push(row(tf, zone));
  }
  return [{ ...row("1h", 2), name: "Binance 1H Zone 2", headline: true }, ...rest];
}
/** Report order: the nine live books (headline first), then the frozen v1 book. */
export function reportBooks() {
  const live = liveBooks().map((b) => ({ ...b, rulesHash: BOOK_HASH[b.id] }));
  return [...live, { tf: "1h", zone: 2, id: LEGACY_ID, name: "Binance 1H Zone 2 (v1)", headline: false, legacy: true, rulesHash: LEGACY_HASH }];
}
/** Parse a strategy id into its scorecard. Null when it is not one of ours. */
export function bookOf(strategy) {
  const m = /^bn-(15m|1h|4h)-z([123])-v([12])$/.exec(String(strategy ?? ""));
  if (!m) return null;
  const tf = m[1], zone = Number(m[2]), version = m[3];
  return { tf, zone, version, id: `bn-${tf}-z${zone}-v${version}`, legacy: version === "1", headline: version === "2" && tf === "1h" && zone === 2 };
}
