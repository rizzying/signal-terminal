// Forward-test rule versions. v1 = original zone rules, v2 = 3.5 ATR zone cap (v2.7.5, pushed 2026-10-14 09:02:16 WIB), v3 = deduped logging (v2.7.6, stored in fwd_snapshots.rules).
// Old rows are never updated: their version is derived from created_at.
export const V2_AT = "2026-10-14T02:02:16Z";
export const LATEST = "v3";
export const VERSIONS = ["v3", "v2", "v1"];
export const VERSION_SQL = `coalesce(s.rules, case when s.created_at >= timestamptz '${V2_AT}' then 'v2' else 'v1' end)`;
export const VERSION_LABEL = { v3: "v3 · deduped", v2: "v2 · zone cap", v1: "v1 · original", all: "All versions" };
/** Query-string value → a known version or "all"; anything else → newest. */
export const parseVersion = (v) => (v === "all" || VERSIONS.includes(v) ? v : LATEST);
