/**
 * Worker bindings and variables.
 * Worker のバインディングと変数。
 */
export interface Env {
  DB: D1Database;
  PageRoom: DurableObjectNamespace;
  /** Better Auth signing secret (`wrangler secret put` / `.dev.vars`). */
  BETTER_AUTH_SECRET: string;
  /** Public origin; defaults to the request origin in development. */
  BETTER_AUTH_URL?: string;
  /** `development` enables the seeding route. */
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Test IdP Worker (`wrangler.test-idp.jsonc`) that stands in for Google. Bound in local runs,
   * tests, Previews and staging; never in production.
   */
  TEST_IDP?: Fetcher;
}

/** Whether development-only routes (seeding) are enabled. */
export const isDevelopment = (env: Pick<Env, "ENVIRONMENT">) => env.ENVIRONMENT === "development";
