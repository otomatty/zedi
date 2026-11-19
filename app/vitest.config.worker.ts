import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { createTestIdp } from "./src/testIdp/app";
import { TEST_IDP_PASSWORD } from "./src/worker/integration/testIdpPassword";

/**
 * Integration tests that run inside workerd with real D1 (SQLite) and Durable Object
 * bindings from wrangler.jsonc. Migrations are the same SQL files `wrangler` applies.
 * The app's TEST_IDP service binding is served by the test IdP running in Node, so sign-in
 * goes through the real OAuth flow without a second Worker.
 * workerd 上で D1・DO バインディング付きで動かす統合テスト。テスト用 IdP は Node 側で動かす。
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
          serviceBindings: {
            TEST_IDP: (request: Request) =>
              createTestIdp({
                secret: "workerd-test-idp-secret-000000000000",
                password: TEST_IDP_PASSWORD,
                emailDomain: "test.zedi-note.app",
                clientId: "zedi-app",
              }).fetch(request),
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
