/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};
const appVersion = packageJson.version ?? "0.0.0";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ prefixed) for vite.config use
  const env = loadEnv(mode, process.cwd(), "");

  const port = parseInt(env.VITE_PORT || env.PORT || "30000", 10);

  // API Gateway URL for dev proxy (avoids CORS in local development).
  // Uses ZEDI_API_PROXY_TARGET (no VITE_ prefix) so client code doesn't see it.
  const apiTarget = env.ZEDI_API_PROXY_TARGET || "";

  // Tauri が設定する環境変数。セットされていれば Tauri WebView 内で動作中。
  // Set by Tauri CLI; when present the app runs inside a Tauri WebView.
  const isTauri = !!env.TAURI_ENV_PLATFORM;
  const tauriDevHost = env.TAURI_DEV_HOST;

  return {
    clearScreen: false,
    server: {
      host: tauriDevHost || "::",
      port,
      strictPort: isTauri, // Tauri はポート固定を期待 / Tauri expects a fixed port
      hmr: tauriDevHost ? { protocol: "ws", host: tauriDevHost, port: 1421 } : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
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
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: {
      target: isTauri
        ? process.env.TAURI_ENV_PLATFORM === "windows"
          ? "chrome105"
          : "safari13"
        : "esnext",
      minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
    },
    plugins: [wasm(), topLevelAwait(), react(), mode === "development" && componentTagger()].filter(
      Boolean,
    ),
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
