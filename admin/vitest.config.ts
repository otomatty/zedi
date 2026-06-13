import path from "path";
import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../vitest.coverage.shared";

export default defineConfig({
  // Anchor `include` / `setupFiles` to admin/ so the config also works when
  // invoked from the workspace root (`vitest run --config admin/vitest.config.ts`).
  // ルート（`vitest run --config admin/vitest.config.ts`）から呼ばれた場合も
  // `include` / `setupFiles` が admin/ 配下を指すよう root を固定する。
  root: __dirname,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Prefer workspace root React so @zedi/ui and Radix use the same instance
      react: path.resolve(__dirname, "../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: createCoverageConfig({
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/App.tsx", "src/vite-env.d.ts", "src/i18n/locales/**"],
    }),
  },
});
