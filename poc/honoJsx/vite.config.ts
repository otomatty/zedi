import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Files in `src/client/public` that the service worker precaches with the build assets. */
const PUBLIC_PRECACHE = ["/manifest.webmanifest", "/icon.svg"];

/**
 * Fills the service worker's precache list and cache version from the final bundle
 * (the hashed asset names are only known at this point).
 * Service Worker の保存一覧とキャッシュのバージョンを、確定したバンドルから埋め込む。
 */
function serviceWorkerManifest(): Plugin {
  return {
    name: "zedi-service-worker-manifest",
    apply: "build",
    generateBundle(_, bundle) {
      const sw = bundle["sw.js"];
      if (!sw || sw.type !== "chunk") return this.error("sw.js was not built");
      const precache = [
        ...Object.keys(bundle)
          .filter((file) => file.startsWith("assets/") && !file.endsWith(".map"))
          .sort()
          .map((file) => `/${file}`),
        ...PUBLIC_PRECACHE,
      ];
      const version = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
      // The minifier may inline the constants or turn them into template literals.
      const code = sw.code
        .replaceAll(
          /["'`]__ZEDI_PRECACHE__["'`]/g,
          precache.map((f) => JSON.stringify(f)).join(","),
        )
        .replaceAll("__ZEDI_VERSION__", version);
      if (code.includes("__ZEDI_"))
        return this.error("service worker placeholders were not filled");
      // A service worker loaded as a classic script cannot import shared chunks.
      if (sw.imports.length > 0) return this.error(`sw.js imports ${sw.imports.join(", ")}`);
      sw.code = code;
    },
  };
}

/**
 * Client SPA build. The Worker (wrangler) serves `dist/client` as Static Assets
 * and handles `/`, `/api/*` and `/parties/*` itself (see wrangler.jsonc).
 * クライアント SPA のビルド設定。配信は wrangler.jsonc の Worker が担う。
 */
export default defineConfig({
  root: "src/client",
  publicDir: "public",
  plugins: [serviceWorkerManifest()],
  oxc: {
    jsx: { runtime: "automatic", importSource: "hono/jsx/dom" },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    target: "es2022",
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, "src/client/index.html"),
        sw: resolve(import.meta.dirname, "src/client/sw/sw.ts"),
      },
      output: {
        // The service worker must live at the root to control every page.
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/parties": { target: "ws://localhost:8787", ws: true },
    },
  },
});
