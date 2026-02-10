/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ prefixed) for vite.config use
  const env = loadEnv(mode, process.cwd(), "");

  // 環境変数からポートを取得、デフォルトは30000（被りにくい開発用ポート）
  // ポートが使用中の場合は自動的に次の利用可能なポートを使用
  const port = parseInt(env.VITE_PORT || env.PORT || "30000", 10);

  // API Gateway URL for dev proxy (avoids CORS in local development).
  // Uses ZEDI_API_PROXY_TARGET (no VITE_ prefix) so client code doesn't see it;
  // client requests go to same-origin /api/* which Vite proxies to the real API.
  const apiTarget = env.ZEDI_API_PROXY_TARGET || "";

  return {
    server: {
      host: "::",
      port,
      strictPort: false, // ポートが使用中の場合は自動的に次のポートを使用
      ...(apiTarget
        ? {
            proxy: {
              "/api": {
                target: apiTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    // Enable top-level await for sql.js
    build: {
      target: "esnext",
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
    },
    plugins: [
      wasm(),
      topLevelAwait(),
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/*.spec.{ts,tsx}",
          "src/test/**",
          "src/main.tsx",
          "src/vite-env.d.ts",
        ],
      },
    },
  };
});
