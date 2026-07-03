/**
 * Cloudflare Workers bindings for the Zedi API Worker (#1091 / Phase 2a).
 * Generated types are merged via `worker-configuration.d.ts` (`wrangler types`).
 *
 * Zedi API Worker 用の Cloudflare バインディング型。
 */
export interface CloudflareBindings {
  /** R2 bucket for media / thumbnails / PDF highlights (#1089). */
  STORAGE_BUCKET: R2Bucket;
}
