#!/usr/bin/env node
/**
 * Zedi MCP — HTTP / Streamable HTTP エントリーポイント (Node)
 *
 * Hono + `WebStandardStreamableHTTPServerTransport` を使い、外部 Claude Code クライアントから
 * リモート接続を受け付ける。Railway などの単独 Node サービスとしてデプロイする想定。
 * アプリ本体 (ルーティング / Bearer 認証 / MCP 配線) は `app.ts` に切り出しており、
 * Cloudflare Workers エントリ (`worker.ts`) と共有する (#1092)。
 *
 * 環境変数:
 *   ZEDI_API_URL    バックエンド REST API の URL (例: http://api.railway.internal:3000)
 *   PORT            待ち受けポート (default: 3100)
 *   MCP_HOST        待ち受けホスト (default: 0.0.0.0)
 *
 * Node HTTP entry point for the Zedi MCP server. The Hono app itself lives in
 * `app.ts`, shared with the Cloudflare Workers entry (`worker.ts`).
 */
import { serve } from "@hono/node-server";
import { createHttpApp, DEFAULT_API_URL } from "./app.js";

// 後方互換のため再エクスポートする (既存テスト / 利用側は `http.js` から import している)。
// Re-exported for backward compatibility with existing imports.
export { createHttpApp } from "./app.js";

async function main() {
  const apiUrl = process.env.ZEDI_API_URL ?? DEFAULT_API_URL;
  const port = parseInt(process.env.PORT ?? "3100", 10);
  const host = process.env.MCP_HOST ?? "0.0.0.0";

  const app = createHttpApp(apiUrl);

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    // HTTP transport は stdout を使用しないため通常の console.log で問題ない。
    console.log("========================================");
    console.log("  Zedi MCP HTTP Server Started");
    console.log("========================================");
    console.log(`  Host:    ${host}`);
    console.log(`  Port:    ${info.port}`);
    console.log(`  API URL: ${apiUrl}`);
    console.log(`  Health:  http://localhost:${info.port}/health`);
    console.log(`  MCP:     http://localhost:${info.port}/mcp`);
    console.log("========================================");
  });
}

// Only run main when invoked as the entry point.
// このファイルが直接実行された場合のみ main() を呼ぶ (テスト時は呼ばない)。
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("http.js")) {
  main().catch((err) => {
    console.error("[zedi-mcp-http] fatal:", err);
    process.exit(1);
  });
}
