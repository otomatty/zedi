/**
 * Worker バンドル検査の純ロジック（#1091 LC-5）。
 *
 * `wrangler deploy --dry-run --outdir` の出力（esbuild は取り込んだモジュールを
 * `// node_modules/...` / `// src/...` のパスコメントとして残す）に、Worker に
 * 入ってはならない依存が含まれていないかを検査する。
 *
 * Pure logic for the Worker bundle guard. Scans the dry-run bundle output for
 * forbidden module markers (esbuild leaves per-module path comments).
 */

/**
 * Worker バンドルに存在してはならないマーカー（FR-1.2 / FR-2.3 / LC-4）。
 * - `@langchain/*` と `src/agents/**` — ルート分割で除外（appAgents.ts は Node 専用）
 * - `@hono/node-server` — clientIpNode.ts 経由の Node 専用フォールバック
 * - `@sentry/node` — Worker は @sentry/cloudflare を使う
 * - `ioredis` — Worker は DurableObjectKvStore を使う（createKvStoreNode.ts が Node 専用）
 */
export const FORBIDDEN_MARKERS: readonly string[] = [
  "node_modules/@langchain/",
  "src/agents/",
  "node_modules/@hono/node-server/",
  "node_modules/@sentry/node/",
  "node_modules/ioredis/",
];

/**
 * バンドル内容から検出された禁止マーカーを返す（各マーカー高々 1 回）。
 * Return the forbidden markers found in the bundle content (each at most once).
 */
export function findForbiddenMarkers(content: string): string[] {
  return FORBIDDEN_MARKERS.filter((marker) => content.includes(marker));
}
