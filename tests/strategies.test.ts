import "fake-indexeddb/auto";
import { allStrategies, BUILTINS, createStrategy, deleteStrategy, saveStrategy, userStrategies, uniqueName } from "../src/strategies";
import { db } from "../src/journal/db";
import { DEFAULTS, sanitize } from "../src/engine/settings";
import { scan } from "../src/engine/scan";
import type { Candle } from "../src/engine/indicators";
describe("saved strategies", () => {
  it("has the 4 built-ins, valid and distinct", () => {
    expect(BUILTINS.map((b) => b.name)).toEqual(["Signal default", "Double EMA 21/50 + RSI", "Breakout with volume", "Structure + FVG/OB"]);
    const c: Candle[] = Array.from({ length: 300 }, (_, i) => { const x = 100 + 0.2 * i + 6 * Math.sin(i / 4); return { t: i, o: x - 0.2, h: x + 0.8, l: x - 0.8, c: x, v: 10 + (i % 5) }; });
    for (const b of BUILTINS) { const s = scan(c, "long", b.settings); expect(s.zones).toHaveLength(3); }
    expect(BUILTINS[1].settings.weights.fvgob).toBe(0); expect(BUILTINS[3].settings.weights.ema).toBe(0);
  });
  it("migrates v1 presets, then create / edit / duplicate / delete", async () => {
    await db.set("presets", [{ name: "Old", settings: { ...DEFAULTS, rsiLen: 9 } }]);
    const u = await userStrategies(); expect(u[0]).toMatchObject({ name: "Old" }); expect(u[0].settings.rsiLen).toBe(9);
    const n = await createStrategy("Mine", sanitize({ minOthers: 4 })); expect((await allStrategies()).length).toBe(6);
    await saveStrategy({ ...n, settings: sanitize({ minOthers: 5 }) }); expect((await userStrategies()).find((x) => x.id === n.id)!.settings.minOthers).toBe(5);
    const d = await createStrategy("Mine", n.settings); expect(d.name).toBe("Mine (2)");
    await deleteStrategy(n.id); expect((await userStrategies()).some((x) => x.id === n.id)).toBe(false);
    await expect(saveStrategy(BUILTINS[0])).rejects.toThrow();
    expect(uniqueName("A", [{ id: "1", name: "A", settings: DEFAULTS }])).toBe("A (2)");
  });
});
