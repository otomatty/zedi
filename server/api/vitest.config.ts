import { defineConfig } from "vitest/config";
import { createCoverageConfig } from "../../vitest.coverage.shared";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,tsx}"],
    // workerd 実行テストは vitest.config.worker.ts（test:worker）専用。
    // Worker-runtime tests run only under vitest.config.worker.ts.
    exclude: ["**/node_modules/**", "src/__tests__/worker/**"],
    coverage: createCoverageConfig({
      include: ["src/**/*.ts", "scripts/**/*.ts"],
      exclude: ["src/types/**", "src/index.ts"],
    }),
  },
});
