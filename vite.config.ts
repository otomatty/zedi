/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 環境変数からポートを取得、デフォルトは30000（被りにくい開発用ポート）
  // ポートが使用中の場合は自動的に次の利用可能なポートを使用
  const port = parseInt(process.env.VITE_PORT || process.env.PORT || "30000", 10);

  return {
    server: {
      host: "::",
      port,
      strictPort: false, // ポートが使用中の場合は自動的に次のポートを使用
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
