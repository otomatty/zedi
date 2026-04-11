/**
 * MCP 用 Bearer JWT 認証ミドルウェア
 *
 * `Authorization: Bearer <token>` を検証し、要求スコープを満たしていれば
 * `c.set("userId", payload.sub)` を行ってリクエストを通す。
 *
 * - `mcpReadRequired`: `mcp:read` または `mcp:write` を持つトークンを許可する
 *   (write は read を内包すると見なす)。
 * - `mcpWriteRequired`: `mcp:write` を必須とする。
 *
 * Bearer JWT middleware for MCP routes. Sets `userId` on context after scope check.
 * `mcp:write` implicitly grants read permission.
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyMcpToken, MCP_SCOPE_READ, MCP_SCOPE_WRITE, hasScope } from "../lib/mcpAuth.js";
import type { AppEnv } from "../types/index.js";

/**
 * Bearer トークンを検証し、ペイロードを返す。形式不正・検証失敗時は 401 を投げる。
 * Verifies the Bearer token from request headers; throws HTTPException 401 on failure.
 */
async function extractAndVerify(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Bearer token required" });
  }
  const token = authHeader.slice(7).trim();
  const payload = await verifyMcpToken(token);
  if (!payload) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
  return payload;
}

/**
 * MCP 読み取り系操作のための認証ミドルウェア。`mcp:read` または `mcp:write` を要求する。
 * Auth middleware for read-only MCP routes; accepts `mcp:read` or `mcp:write` scope.
 */
export const mcpReadRequired = createMiddleware<AppEnv>(async (c, next) => {
  const payload = await extractAndVerify(c.req.header("Authorization"));
  if (!hasScope(payload, MCP_SCOPE_READ) && !hasScope(payload, MCP_SCOPE_WRITE)) {
    throw new HTTPException(403, { message: "mcp:read scope required" });
  }
  c.set("userId", payload.sub);
  await next();
});

/**
 * MCP 書き込み系操作のための認証ミドルウェア。`mcp:write` スコープを要求する。
 * Auth middleware for write MCP routes; requires `mcp:write` scope.
 */
export const mcpWriteRequired = createMiddleware<AppEnv>(async (c, next) => {
  const payload = await extractAndVerify(c.req.header("Authorization"));
  if (!hasScope(payload, MCP_SCOPE_WRITE)) {
    throw new HTTPException(403, { message: "mcp:write scope required" });
  }
  c.set("userId", payload.sub);
  await next();
});
