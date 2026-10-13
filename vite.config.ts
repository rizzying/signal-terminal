import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
// Stamp the service-worker cache name per build so old assets are dropped after each deploy.
const swVersion = () => ({ name: "sw-version", apply: "build" as const, closeBundle() { const p = "dist/sw.js"; try { writeFileSync(p, readFileSync(p, "utf8").replace("__BUILD__", Date.now().toString(36))); } catch { /* no sw */ } } });
export default defineConfig({
  plugins: [react(), swVersion()],
  build: { rollupOptions: { output: { manualChunks: { charts: ["lightweight-charts"], react: ["react", "react-dom"] } } } },
  test: { environment: "jsdom", globals: true },
} as any);
