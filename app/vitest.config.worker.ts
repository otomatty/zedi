import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/**
 * Integration tests that run inside workerd with real D1 (SQLite) and Durable Object
 * bindings from wrangler.jsonc. Migrations are the same SQL files `wrangler` applies.
 * workerd 上で D1・DO バインディング付きで動かす統合テスト。
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: "workerd-test-secret-0000000000000000",
            ENVIRONMENT: "development",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ["src/**/*.worker.test.ts"],
      setupFiles: ["./src/worker/integration/applyMigrations.ts"],
    },
  };
});
