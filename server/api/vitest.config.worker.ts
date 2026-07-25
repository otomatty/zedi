/**
 * workerd 実行テスト用の vitest 設定（#1091 LC-6、`bun run test:worker`）。
 *
 * 既存の Node 実行テスト（vitest.config.ts）とは完全分離し、
 * `src/__tests__/worker/**` だけを @cloudflare/vitest-pool-workers（0.18+ の
 * vitest 4 向け `cloudflareTest` プラグイン API）で workerd 上で実行する。
 * バインディング（R2 / KV_DO / vars）は wrangler.jsonc の dev env から
 * miniflare が構成する。
 *
 * Worker-runtime test config. Runs only `src/__tests__/worker/**` on workerd
 * via the vitest-pool-workers `cloudflareTest` plugin (vitest 4 API), with
 * bindings simulated from wrangler.jsonc.
 */
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc", environment: "dev" },
      miniflare: {
        bindings: {
          // 実 dev では wrangler.jsonc vars / secrets が供給する値のテスト代替。
          RUNTIME: "cloudflare-workers",
          BETTER_AUTH_URL: "https://zedi-api-dev.test",
          BETTER_AUTH_SECRET: "workerd-test-secret-0000000000000000",
          // auth.ts はモジュールロード時に OAuth/CORS env も要求する（実 dev では
          // wrangler secrets）。ここではダミー値でランタイム適合のみ検証する。
          GOOGLE_CLIENT_ID: "workerd-test-google-id",
          GOOGLE_CLIENT_SECRET: "workerd-test-google-secret",
          CORS_ORIGIN: "https://zedi-note.app",
          // DB へは到達しない（lazy 接続）。到達した場合はマスク済み 5xx を検証する。
          DATABASE_URL: "postgres://workerd-test:unused@127.0.0.1:5/unused",
        },
      },
    }),
  ],
  test: {
    globals: true,
    include: ["src/__tests__/worker/**/*.test.ts"],
  },
});
