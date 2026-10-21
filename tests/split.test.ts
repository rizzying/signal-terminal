import { confBand, splitBoards, SPLITS } from "../src/forward/split.js";
import { scoreboards } from "../src/forward/paper.js";
import { confidenceBand } from "../src/engine/scan";

const B = "bn-15m-z1-v2", V1 = "bn-1h-z2-v1";
const row = (id: number, o: Record<string, unknown>) => ({ id, key: `${o.strategy ?? B}|BTCUSDT|${id}`, strategy: B, rules_hash: "b3fe341b", market: "BTCUSDT", side: "long", status: "closed", placed_t: String(id * 100), exit_reason: null, r_net: null, exit_t: id * 100 + 50, conf: 60, ...o });
const T = [
  row(1, { exit_reason: "tp", r_net: 3, conf: 75 }),
  row(2, { exit_reason: "sl", r_net: -1, conf: 60 }),
  row(3, { exit_reason: "sl", r_net: -1.1, conf: 40 }),
  row(4, { exit_reason: "tp", r_net: 2.9, conf: null, placed_t: "130" }),
  row(5, { status: "pending", conf: 70, exit_t: null, placed_t: "140" }),
  row(6, { status: "open", conf: 80, exit_t: null, placed_t: "150" }),
  row(7, { exit_reason: "sl", r_net: -1.05, conf: 50, placed_t: "120" }),
  row(8, { strategy: V1, rules_hash: "b81ceeeb", exit_reason: "tp", r_net: 2, conf: 72 }),
  row(9, { strategy: "bn-1h-z2-v2", exit_reason: "sl", r_net: -1, conf: 55 }),
];
const G = [
  { key: T[0].key, verdict: "ok", strength: "Strong", facts: null },
  { key: T[1].key, verdict: "ok", strength: "Strong", facts: null },
  { key: T[2].key, verdict: "ok", strength: "Weak", facts: null },
  { key: T[3].key, verdict: "moved", strength: null, facts: { replaced: 1 } },
  { key: T[5].key, verdict: "mismatch", strength: null, facts: { fields: ["entry", "tp"], replay: { entry: 100, tp: 106 }, stored: { entry: 100.5, tp: 106.5 } } },
  { key: T[7].key, verdict: "rules", strength: null, facts: { hash: "abc12345", want: "b81ceeeb" } },
];
const pick = (xs: any[]) => xs.map(({ level, n, wins, totalR }) => [level, n, wins, +totalR.toFixed(9)]);

it("confidence bands match the engine's cuts, and a missing confidence is Unknown, not Low", () => {
  const want: Record<number, string> = { 0: "Low", 49: "Low", 50: "Med", 70: "Med", 71: "High", 100: "High" };
  for (const c of [0, 49, 50, 70, 71, 100]) {
    expect(confBand(c)).toBe(want[c]);
    expect(confBand(c)).toBe({ Low: "Low", Medium: "Med", High: "High" }[confidenceBand(c)]);
  }
  expect(confBand(null)).toBe("Unknown"); expect(confidenceBand(null as any)).toBe("Low");
  for (const c of [undefined, "", NaN, "x"]) expect(confBand(c)).toBe("Unknown");
  expect(confBand("78")).toBe("High");
});

it("each card splits its closed trades by placement strength and confidence, and the slices sum to the card", () => {
  const split = splitBoards(T, G); const boards = scoreboards(T);
  expect(Object.keys(split)).toEqual(boards.map((b) => b.id));
  const s = split[B];
  expect(pick(s.strength)).toEqual([["Strong", 2, 1, 2], ["OK", 0, 0, 0], ["Weak", 1, 0, -1.1], ["Unknown", 2, 1, 1.85]]);
  expect(pick(s.conf)).toEqual([["Low", 1, 0, -1.1], ["Med", 2, 0, -2.05], ["High", 1, 1, 3], ["Unknown", 1, 1, 2.9]]);
  expect(s.strength[0]).toMatchObject({ winRate: 0.5, avgR: 1, early: true });
  expect(s.strength[1]).toMatchObject({ winRate: null, avgR: null, early: true });
  for (const b of boards) for (const a of SPLITS) {
    const sl = split[b.id][a.key];
    expect(sl.map((x: any) => x.level)).toEqual(a.levels);
    expect(sl.reduce((n: number, x: any) => n + x.n, 0)).toBe(b.n);
    expect(sl.reduce((r: number, x: any) => r + x.totalR, 0)).toBeCloseTo(b.score.totalR, 9);
    for (const x of sl) expect(Object.keys(x).sort()).toEqual(["avgR", "early", "level", "n", "totalR", "winRate", "wins"]);
  }
  expect(Object.keys(s).sort()).toEqual(["conf", "strength", "unknown"]);
  expect(JSON.stringify(split)).not.toMatch(/verdict|ciLo|ciHi|"pf"/);
});

it("lists every trade without an ok grade, any status, oldest first, with its reason in words", () => {
  const u = splitBoards(T, G)[B].unknown;
  expect(u.map((x: any) => [x.id, x.reason, x.status, x.tstatus])).toEqual([
    ["F-7", "not-graded", "closed", "sl"], ["F-4", "moved", "closed", "tp"], ["F-5", "not-graded", "pending", "pending"], ["F-6", "mismatch", "open", "open"]]);
  expect(u.map((x: any) => x.detail)).toEqual([
    "Not graded yet. The next hourly run grades it.",
    "Moved once after it was placed, so its placed prices are gone.",
    "Not graded yet. The next hourly run grades it.",
    "The replay gave entry 100, stored 100.5; target 106, stored 106.5."]);
  expect(Object.keys(u[0]).sort()).toEqual(["detail", "id", "key", "market", "placed_t", "reason", "side", "status", "tstatus"]);
  expect(u[0]).toMatchObject({ key: T[6].key, market: "BTCUSDT", side: "long", placed_t: 120 });
  expect(splitBoards(T, G)[V1].unknown[0].detail).toBe("Placed under rules abc12345, not this card's b81ceeeb.");
  expect(splitBoards(T, [{ key: T[3].key, verdict: "moved", facts: { replaced: 4 } }])[B].unknown.find((x: any) => x.id === "F-4").detail).toBe("Moved 4 times after it was placed, so its placed prices are gone.");
});

it("refuses rows selected without key or conf, so a narrowed query can't pass for an all-Unknown split", () => {
  const { conf, ...noConf } = T[0]; const { key, ...noKey } = T[0];
  expect(() => splitBoards([noConf], [])).toThrow(/key and fwd_trades.conf/);
  expect(() => splitBoards([noKey], [])).toThrow(/key and fwd_trades.conf/);
  expect(splitBoards([{ ...T[0], conf: null }], [])[B].conf[3].n).toBe(1);
  expect(splitBoards([], [])[B].strength.every((x: any) => x.n === 0)).toBe(true);
});
