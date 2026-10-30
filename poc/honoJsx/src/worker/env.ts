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
  /** `development` enables the dev outbox and seeding routes. */
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Whether development-only routes (outbox, seeding) are enabled. */
export const isDevelopment = (env: Pick<Env, "ENVIRONMENT">) => env.ENVIRONMENT === "development";
