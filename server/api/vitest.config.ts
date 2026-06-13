import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,tsx}"],
    coverage: createCoverageConfig({
      include: ["src/**/*.ts", "scripts/**/*.ts"],
      exclude: ["src/types/**", "src/index.ts"],
    }),
  },
});
