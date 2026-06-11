import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../../vitest.coverage.shared";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: createCoverageConfig({
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/stdio.ts", "src/http.ts"],
    }),
  },
});
