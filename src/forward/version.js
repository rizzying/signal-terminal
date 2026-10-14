// Forward-test rule versions. v1 = original zone rules, v2 = 3.5 ATR zone cap (v2.7.5, pushed 2026-10-14 09:02:16 WIB),
// v3 = deduped logging (v2.7.6, stored in fwd_snapshots.rules), v4 = all Bulk TRADING markets (+ same on HL), 15m/1H/4H/1D, entry-zone dedupe (v2.8.0).
// Old rows are never updated: v1/v2 are derived from created_at.
export const V2_AT = "2026-10-14T02:02:16Z";
export const LATEST = "v4";
export const VERSIONS = ["v4", "v3", "v2", "v1"];
export const VERSION_SQL = `coalesce(s.rules, case when s.created_at >= timestamptz '${V2_AT}' then 'v2' else 'v1' end)`;
export const VERSION_LABEL = { v4: "v4 · all Bulk markets, 15m–1D", v3: "v3 · deduped", v2: "v2 · zone cap", v1: "v1 · original", all: "All versions" };
/** Query-string value → a known version or "all"; anything else → newest. */
export const parseVersion = (v) => (v === "all" || VERSIONS.includes(v) ? v : LATEST);
