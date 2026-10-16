import { defineConfig, type Connect, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteWelcome } from "./src/welcomeRoute";

const root = fileURLToPath(new URL(".", import.meta.url));
// Stamp the service-worker cache name per build so old assets are dropped after each deploy.
const swVersion = () => ({ name: "sw-version", apply: "build" as const, closeBundle() { const p = "dist/sw.js"; try { writeFileSync(p, readFileSync(p, "utf8").replace("__BUILD__", Date.now().toString(36))); } catch { /* no sw */ } } });
const welcomeRoute = () => ({
  name: "welcome-route",
  configureServer(server: ViteDevServer) { server.middlewares.use(welcomeMiddleware); },
  configurePreviewServer(server: PreviewServer) { server.middlewares.use(welcomeMiddleware); },
});
const welcomeMiddleware: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url) req.url = rewriteWelcome(req.url);
  next();
};

export default defineConfig({
  plugins: [react(), swVersion(), welcomeRoute()],
  build: { rollupOptions: { input: { main: resolve(root, "index.html"), welcome: resolve(root, "welcome.html") }, output: { manualChunks: { charts: ["lightweight-charts"], react: ["react", "react-dom"] } } } },
  test: { environment: "jsdom", globals: true },
} as any);
