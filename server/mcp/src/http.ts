#!/usr/bin/env node
/**
 * Zedi MCP — HTTP / Streamable HTTP エントリーポイント
 *
 * Hono + `WebStandardStreamableHTTPServerTransport` を使い、外部 Claude Code クライアントから
 * リモート接続を受け付ける。Railway などの単独サービスとしてデプロイする想定。
 *
 * 環境変数:
 *   ZEDI_API_URL    バックエンド REST API の URL (例: http://api.railway.internal:3000)
 *   PORT            待ち受けポート (default: 3100)
 *   MCP_HOST        待ち受けホスト (default: 0.0.0.0)
 *
 * リクエストはセッションごとに以下の流れで処理する:
 *   1. クライアントが `Authorization: Bearer <MCP JWT>` ヘッダ付きでアクセス
 *   2. ヘッダから JWT を取り出し、新しい `HttpZediClient` を生成
 *   3. リクエストごとに新しい `McpServer` を建て、トランスポートを通して応答する
 *      (ステートレスモード — sessionIdGenerator: undefined)
 *
 * HTTP entry point for the Zedi MCP server using Streamable HTTP transport.
 * Each request gets its own per-token client + server instance (stateless).
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server.js";
import { HttpZediClient } from "./client/httpClient.js";

const DEFAULT_API_URL = "https://api.zedi.app";

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * リクエストごとに `HttpZediClient` と `McpServer` を生成し、トランスポートで応答する。
 * Per-request handler: builds an isolated MCP server bound to the caller's bearer token.
 */
async function handleMcpRequest(rawRequest: Request, apiUrl: string): Promise<Response> {
  const token = extractBearer(rawRequest.headers.get("Authorization") ?? undefined);
  if (!token) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Bearer token required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const client = new HttpZediClient({ baseUrl: apiUrl, token });
  const server = createMcpServer(client);
  // Stateless mode: each HTTP exchange creates its own ephemeral session.
  // セッションは持たず、リクエストごとに新規生成する。
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  try {
    return await transport.handleRequest(rawRequest);
  } finally {
    // Best-effort cleanup; the per-request server isn't reused.
    // 使い捨てサーバーは後始末のみする。
    await server.close().catch(() => {});
  }
}

/**
 * Hono アプリを生成する。テストから呼べるよう関数として export する。
 * Builds the Hono app; exported for testing.
 */
export function createHttpApp(apiUrl: string): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, server: "zedi-mcp", apiUrl }));

  app.all("/mcp", async (c) => handleMcpRequest(c.req.raw, apiUrl));

  return app;
}

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
