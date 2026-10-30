import { applyD1Migrations, env } from "cloudflare:test";

// Run the same SQL migrations that `wrangler d1 migrations apply` uses.
if (!env.TEST_MIGRATIONS)
  throw new Error("TEST_MIGRATIONS binding is missing (see vitest.config.worker.ts)");
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
