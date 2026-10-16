# Signal

Entry terminal: scan long/short entries on Hyperliquid, Bulk and Binance public market data, compare with your own checklist, and journal trades **on your device only**.

- Static Vite + React app, no backend, no accounts, no API keys. Deploy on Vercel Hobby (`vercel.json` included).
- Data: Hyperliquid `api.hyperliquid.xyz/info`, Bulk `mainnet-api1.bulk.trade/api/v1`, Binance spot via the public mirror `data-api.binance.vision` (CORS-enabled, not geo-blocked).
- Engine (`src/engine/scan.ts`): BoS/ChoCH, FVG + order blocks, HH/HL/LH/LL, clean breakers, inducement sweeps, RSI context/divergence, EMA trend → weighted confidence (agreement, **not** win probability). Three zones (aggressive / balanced / deep), each with its own stop, T1/T2 and R:R; stop nudged past estimated liquidation clusters (heatmap weight). Each zone also has a Strong / OK / Weak label from structure, liquidation confluence, ATR distance, freshness, and the signals that match that level (`docs/ZONE_STRENGTH.md`). That label is display-only and is not a win chance.
- Every parameter is editable in Settings, with defaults/reset and device-only presets; the settings snapshot is stored with each journaled trade.
- Journal: IndexedDB; JSON export/import; import from public Hyperliquid/Bulk wallet fills and Binance trade-history CSV; stats by signal, confidence band, emotion, plan followed.
- No order placement or signing exists in this app.

```
npm i && npm run dev     # dev
npm test                 # unit tests
npm run build            # tsc + vite build → dist/
node scripts_qa.mjs      # QA sweep (needs `npm run preview` on :4173 and Chrome) → docs/qa/
```
