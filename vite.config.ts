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

/**
 * Parse a truthy env string (e.g. `TAURI_ENV_DEBUG`). Non-empty strings like `"false"` are not treated as true.
 * 環境変数の真偽フラグを解釈する。`"false"` などは true にしない。
 */
function envFlagIsTrue(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(String(value ?? "").trim());
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ prefixed) for vite.config use
  const env = loadEnv(mode, process.cwd(), "");

  const port = parseInt(env.VITE_PORT || env.PORT || "30000", 10);

  // API Gateway URL for dev proxy (avoids CORS in local development).
  // Uses ZEDI_API_PROXY_TARGET (no VITE_ prefix) so client code doesn't see it.
  const apiTarget = env.ZEDI_API_PROXY_TARGET || "";

  // Tauri CLI は子プロセスの process.env に TAURI_* を注入する。loadEnv は .env 由来のみのため
  // process.env とマージして参照する（strictPort / build.target の分岐を確実にする）。
  // Tauri CLI injects TAURI_* into the dev server process; merge with loadEnv for reliable detection.
  const tauriPlatform = process.env.TAURI_ENV_PLATFORM ?? env.TAURI_ENV_PLATFORM;
  const tauriDevHost = process.env.TAURI_DEV_HOST ?? env.TAURI_DEV_HOST;
  const tauriEnvDebug = envFlagIsTrue(process.env.TAURI_ENV_DEBUG ?? env.TAURI_ENV_DEBUG);
  const isTauri = !!tauriPlatform;

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
    // Vite はプレフィックスの前方一致のみ（ワイルドカードなし）。TAURI_ENV_* は使えない。
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
      target: isTauri ? (tauriPlatform === "windows" ? "chrome105" : "safari13") : "esnext",
      minify: tauriEnvDebug ? false : "esbuild",
      sourcemap: tauriEnvDebug,
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
