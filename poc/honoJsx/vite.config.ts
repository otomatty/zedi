import { defineConfig } from "vite";

/**
 * Client SPA build. The Worker (wrangler) serves `dist/client` as Static Assets
 * and handles `/`, `/api/*` and `/parties/*` itself (see wrangler.jsonc).
 * クライアント SPA のビルド設定。配信は wrangler.jsonc の Worker が担う。
 */
export default defineConfig({
  root: "src/client",
  publicDir: false,
  oxc: {
    jsx: { runtime: "automatic", importSource: "hono/jsx/dom" },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/parties": { target: "ws://localhost:8787", ws: true },
    },
  },
});
