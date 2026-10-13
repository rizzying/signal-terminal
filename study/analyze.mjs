import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("/workspace/bt-cache/grid.json"));
const f = (x, d = 3) => (x >= 0 ? "+" : "") + x.toFixed(d);
const ok = (r, k) => r[k].n >= 60 && r[k].cnt >= 6;
const score = (r, k) => r[k].med * (r[k].pos / Math.max(1, r[k].cnt)); // robust: median per-dataset expectancy × share of datasets positive
const line = (r) => `${r.strat} | Z${r.zone} | k=${r.k} | ${r.exit} | ${r.entry} || IS n=${r.is.n} exp=${f(r.is.exp)}R med=${f(r.is.med)} pos=${r.is.pos}/${r.is.cnt} || OOS n=${r.oos.n} exp=${f(r.oos.exp)}R med=${f(r.oos.med)} pos=${r.oos.pos}/${r.oos.cnt} win=${r.oos.win.toFixed(0)}% DD=${r.oos.maxDD.toFixed(1)}R`;
console.log("== top 12 by IN-SAMPLE robust score (selection) ==");
const isRank = rows.filter((r) => ok(r, "is")).sort((a, b) => score(b, "is") - score(a, "is")); isRank.slice(0, 12).forEach((r) => console.log(line(r)));
console.log("== per strategy: IS pick → OOS ==");
for (const s of [...new Set(rows.map((r) => r.strat))]) { const p = isRank.find((r) => r.strat === s); console.log(p ? line(p) : s + " none"); }
console.log("== top 8 by OOS (hindsight, for info) ==");
rows.filter((r) => ok(r, "oos")).sort((a, b) => score(b, "oos") - score(a, "oos")).slice(0, 8).forEach((r) => console.log(line(r)));
const g = (key) => { const m = {}; for (const r of rows) { (m[r[key]] ??= []).push(r.oos.exp); } return Object.entries(m).map(([k, v]) => `${k}: ${f(v.reduce((a, b) => a + b, 0) / v.length)}`).join(" · "); };
for (const k of ["entry", "exit", "k", "zone", "strat"]) console.log("OOS mean exp by", k, "→", g(k));
console.log("share of configs with OOS pooled exp>0:", (rows.filter((r) => r.oos.exp > 0).length / rows.length * 100).toFixed(0) + "%");
console.log("== chosen common default: k=1.5, TP 2R, close in zone ==");
const pick = rows.filter((r) => r.k === 1.5 && r.exit === "TP 2R" && r.entry === "close in zone");
for (const r of pick) console.log(line(r));
fs.writeFileSync("/workspace/bt-cache/pick.json", JSON.stringify(pick.map((r) => ({ sid: r.sid, zone: r.zone, is: { n: r.is.n, exp: r.is.exp, win: r.is.win, dd: r.is.maxDD, pos: r.is.pos, cnt: r.is.cnt }, oos: { n: r.oos.n, exp: r.oos.exp, win: r.oos.win, dd: r.oos.maxDD, pos: r.oos.pos, cnt: r.oos.cnt }, each: r.oos.each.map((e) => +e.exp.toFixed(3)) }))));
