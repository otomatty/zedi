import path from "path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for `@zedi/ui` package.
 * - Uses jsdom for DOM-touching hooks/components (sidebar, toast, mobile detection).
 * - Aligns React/react-dom with the workspace root so Radix and our package use the same instance.
 *
 * `@zedi/ui` パッケージ用の vitest 設定。
 * - DOM を触るフック・コンポーネント（sidebar, toast, モバイル判定）のため jsdom を使う。
 * - Radix と本パッケージが同一 React インスタンスを共有するよう、ワークスペースルートの react を参照する。
 */
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      react: path.resolve(import.meta.dirname, "../../node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "../../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(import.meta.dirname, "src/test/setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
