import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../../vitest.coverage.shared";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: createCoverageConfig({
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    }),
  },
});
