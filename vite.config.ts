/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { createCoverageConfig, frontendTypeOnlyExcludes } from "./vitest.coverage.shared";

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

  return {
    server: {
      host: "::",
      port,
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
    build: {
      target: "esnext",
      minify: "esbuild",
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
      coverage: createCoverageConfig({
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/main.tsx", "src/App.tsx", "src/vite-env.d.ts", ...frontendTypeOnlyExcludes],
      }),
    },
  };
});
