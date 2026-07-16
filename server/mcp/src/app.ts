/**
 * Zedi MCP — トランスポート中立の Hono アプリ構築 (#1092)
 *
 * Node (`http.ts`) と Cloudflare Workers (`worker.ts`) の両エントリポイントから
 * 共有される。Node 専用 API (`@hono/node-server` 等) を import しないこと —
 * Workers バンドルに含まれるため、Web 標準 API のみで書く。
 *
 * リクエストはセッションごとに以下の流れで処理する:
 *   1. クライアントが `Authorization: Bearer <MCP JWT>` ヘッダ付きでアクセス
 *   2. ヘッダから JWT を取り出し、新しい `HttpZediClient` を生成
 *   3. リクエストごとに新しい `McpServer` を建て、トランスポートを通して応答する
 *      (ステートレスモード — sessionIdGenerator: undefined)
 *
 * JWT の検証・失効 (deny-list) はバックエンド API (`server/api`) 側の責務。
 * この層は Bearer トークンをそのまま API へ転送するだけで秘密鍵を持たない。
 *
 * Transport-neutral Hono app factory shared by the Node entry (`http.ts`) and
 * the Cloudflare Workers entry (`worker.ts`). Keep this module free of
 * Node-only imports — it is bundled into the Worker. JWT verification and the
 * revocation deny-list live in `server/api`; this layer only forwards the
 * bearer token.
 */
import { Hono } from "hono";
import type { Context, Env } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./server.js";
import { HttpZediClient } from "./client/httpClient.js";

/** バックエンド API のデフォルト URL / Default backend API base URL. */
export const DEFAULT_API_URL = "https://api.zedi.app";

/** Workers の env バインディング / Worker env bindings (wrangler.jsonc `vars`). */
export interface McpWorkerEnv {
  /** バックエンド REST API の URL / Backend REST API base URL. */
  ZEDI_API_URL?: string;
  /** デプロイ検証用のコミット SHA (CI が `--var` で注入) / Commit SHA injected by CI. */
  GIT_COMMIT_SHA?: string;
  /** development / production */
  ENVIRONMENT?: string;
}

/** `/health` が公開するリクエスト毎のメタ情報 / Per-request metadata surfaced by `/health`. */
interface RequestContextInfo {
  apiUrl: string;
  gitCommitSha: string | null;
}

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/** 空文字は未設定として扱う / Treat empty strings as unset. */
function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
 * `/health` と `/mcp` を持つ Hono アプリを構築する。API URL / コミット SHA の
 * 解決方法だけがエントリポイント間で異なるため、resolver として注入する。
 * Builds the Hono app; entry points differ only in how they resolve the API
 * URL and commit SHA, injected here as a resolver.
 */
function buildApp<E extends Env>(resolve: (c: Context<E>) => RequestContextInfo): Hono<E> {
  const app = new Hono<E>();

  app.get("/health", (c) => {
    const { apiUrl, gitCommitSha } = resolve(c);
    return c.json({ ok: true, server: "zedi-mcp", apiUrl, git_commit_sha: gitCommitSha });
  });

  app.all("/mcp", async (c) => handleMcpRequest(c.req.raw, resolve(c).apiUrl));

  return app;
}

/**
 * Node エントリ用アプリ。API URL は起動時に固定し、コミット SHA は
 * `GIT_COMMIT_SHA` (CI) → `RAILWAY_GIT_COMMIT_SHA` (Railway) の順で解決する。
 * App for the Node entry: fixed API URL, commit SHA from process.env.
 */
export function createHttpApp(apiUrl: string): Hono {
  return buildApp(() => ({
    apiUrl,
    gitCommitSha:
      normalize(process.env.GIT_COMMIT_SHA) ?? normalize(process.env.RAILWAY_GIT_COMMIT_SHA),
  }));
}

/**
 * Cloudflare Workers エントリ用アプリ。API URL / コミット SHA を env バインディング
 * (`wrangler.jsonc` の `vars` / デプロイ時 `--var`) からリクエスト毎に解決する。
 * App for the Workers entry: resolves API URL / commit SHA from env bindings.
 */
export function createWorkerApp(): Hono<{ Bindings: McpWorkerEnv }> {
  return buildApp<{ Bindings: McpWorkerEnv }>((c) => ({
    apiUrl: normalize(c.env?.ZEDI_API_URL) ?? DEFAULT_API_URL,
    gitCommitSha: normalize(c.env?.GIT_COMMIT_SHA),
  }));
}
