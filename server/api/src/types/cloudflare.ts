/**
 * Cloudflare Workers bindings for the Zedi API Worker (#1091 / Phase 2a).
 * Generated types are merged via `worker-configuration.d.ts` (`wrangler types`).
 *
 * Zedi API Worker 用の Cloudflare バインディング型。
 */
/**
 * Cloudflare Workers 実行時に注入されるリソースバインディング。
 * Resource bindings injected into the Worker runtime environment.
 */
export interface CloudflareBindings {
  /**
   * メディア / サムネイル / PDF ハイライト用の R2 バケット (#1089)。
   * R2 bucket for media / thumbnails / PDF highlights (#1089).
   */
  STORAGE_BUCKET: R2Bucket;
  /**
   * 論理キーごとの KV Durable Object: レート制限・ワンタイムコード・deny-list (#1093)。
   * Per-key KV Durable Objects: rate limits, one-time codes, deny-list (#1093).
   */
  KV_DO: DurableObjectNamespace;
}
