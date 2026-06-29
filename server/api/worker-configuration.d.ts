/* eslint-disable */
// Generated / maintained for Wrangler. Run `bun run worker:types` to refresh from wrangler.jsonc.
/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    ENVIRONMENT?: string;
    GIT_COMMIT_SHA?: string;
    STORAGE_BUCKET: R2Bucket;
    DATABASE_URL: string;
    REDIS_URL?: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    STORAGE_ENDPOINT: string;
    STORAGE_ACCESS_KEY: string;
    STORAGE_SECRET_KEY: string;
    STORAGE_BUCKET_NAME: string;
  }
}

interface Env extends Cloudflare.Env {}
