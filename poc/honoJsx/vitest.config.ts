import { defineConfig } from "vitest/config";

/**
 * Unit tests run in Node by default. Files that need a DOM opt in with
 * `// @vitest-environment happy-dom`. Worker TSX files carry a
 * `@jsxImportSource hono/jsx` pragma, so the client default here does not leak.
 * 既定は Node 環境。DOM が必要なテストはファイル先頭のコメントで happy-dom を指定する。
 */
export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic", importSource: "hono/jsx/dom" },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
