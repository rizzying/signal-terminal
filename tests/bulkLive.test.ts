import { tickCandle } from "../src/api/live";
const M = 60_000;
it("Bulk forming candle from ticker: opens at the last REST close, extends in-bucket, rolls over on a new bucket", () => {
  const seed = { t: 2 * M, o: 100, h: 101, l: 99, c: 100.5, v: 3 }; // REST is a couple of candles behind
  let k = tickCandle(null, seed, 102, 4 * M + 5_000, M); expect(k).toEqual({ t: 4 * M, o: 100.5, h: 102, l: 100.5, c: 102, v: 0 });
  k = tickCandle(k, seed, 99, 4 * M + 30_000, M); expect(k).toMatchObject({ t: 4 * M, o: 100.5, h: 102, l: 99, c: 99 });
  k = tickCandle(k, seed, 99.5, 5 * M + 1, M); expect(k).toMatchObject({ t: 5 * M, o: 99, h: 99.5, l: 99, c: 99.5 });
  expect(tickCandle(null, { ...seed, t: 4 * M }, 103, 4 * M + 1, M)).toMatchObject({ t: 4 * M, o: 100, h: 103, l: 99, c: 103, v: 3 }); // REST already has this bucket
});
