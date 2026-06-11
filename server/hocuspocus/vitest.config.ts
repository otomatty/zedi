import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../../vitest.coverage.shared";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: createCoverageConfig({
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    }),
  },
});
