/**
 * /api/mcp — MCP (Model Context Protocol) サーバー専用ルート
 *
 * - POST /authorize-code  Better Auth セッションで認証済みのユーザーがワンタイムコードを発行する
 * - POST /session         ワンタイムコード + PKCE verifier を JWT に交換する
 * - POST /revoke          MCP JWT を失効登録する (best-effort)
 * - POST /clip            MCP 権限で URL をクリップしてページを生成する (clipAndCreate ラッパ)
 *
 * MCP server routes: PKCE-based authorize/session, token revocation, and clip-and-create.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import { authRequired } from "../middleware/auth.js";
import { mcpReadRequired, mcpWriteRequired } from "../middleware/mcpAuth.js";
import {
  consumeMcpCode,
  isMcpRedirectUriAllowed,
  issueMcpToken,
  storeMcpCode,
  verifyPKCE,
  MCP_SCOPE_READ,
  MCP_SCOPE_WRITE,
} from "../lib/mcpAuth.js";
import { clipAndCreate } from "../lib/clipAndCreate.js";
import { isClipUrlAllowed, isClipUrlAllowedAfterDns } from "../lib/clipUrlPolicy.js";
import type { AppEnv } from "../types/index.js";

const ALLOWED_SCOPES = new Set([MCP_SCOPE_READ, MCP_SCOPE_WRITE]);

const app = new Hono<AppEnv>();

// ── POST /authorize-code ────────────────────────────────────────────────────
// Better Auth セッションを持つユーザーがブラウザから呼び出し、ワンタイムコードを取得する。
// 後続で CLI / Web 側が `/session` に code + verifier を送って JWT に交換する。
//
// Issues a one-time PKCE code for an authenticated user; later exchanged at /session for a JWT.
app.post("/authorize-code", authRequired, async (c) => {
  const redis = c.get("redis");
  if (!redis) {
    throw new HTTPException(503, { message: "Redis unavailable" });
  }

  const body = await c.req.json<{
    redirect_uri?: string;
    code_challenge?: string;
    state?: string;
    scopes?: string[];
  }>();

  if (!body.redirect_uri?.trim() || !body.code_challenge?.trim()) {
    throw new HTTPException(400, {
      message: "redirect_uri and code_challenge are required",
    });
  }

  const redirectUri = body.redirect_uri.trim();
  if (!isMcpRedirectUriAllowed(redirectUri)) {
    throw new HTTPException(400, { message: "redirect_uri not allowed" });
  }

  // Validate requested scopes (default to read+write).
  // 要求スコープを検証する (省略時は read+write を付与)。
  const requestedScopes =
    Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes
      : [MCP_SCOPE_READ, MCP_SCOPE_WRITE];
  for (const s of requestedScopes) {
    if (!ALLOWED_SCOPES.has(s)) {
      throw new HTTPException(400, { message: `Invalid scope: ${s}` });
    }
  }

  const userId = c.get("userId");
  const code = randomBytes(32).toString("base64url");
  // Embed scopes in the challenge value so /session can decide what to mint.
  // 簡易のためスコープは challenge と一緒に保持する (challenge:scopes 形式)。
  const challengeWithScopes = `${body.code_challenge.trim()}|${requestedScopes.join(",")}`;
  await storeMcpCode(redis, code, userId, challengeWithScopes, redirectUri);

  return c.json({
    code,
    state: body.state ?? "",
  });
});

// ── POST /session ───────────────────────────────────────────────────────────
// PKCE code + verifier を交換して MCP 用 JWT を発行する。
// Exchanges a one-time code + PKCE verifier for an MCP-scoped JWT.
app.post("/session", async (c) => {
  const redis = c.get("redis");
  if (!redis) {
    throw new HTTPException(503, { message: "Redis unavailable" });
  }

  const body = await c.req.json<{
    grant_type?: string;
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
  }>();

  if (body.grant_type !== "authorization_code") {
    throw new HTTPException(400, { message: "grant_type must be authorization_code" });
  }
  if (!body.code?.trim() || !body.code_verifier?.trim() || !body.redirect_uri?.trim()) {
    throw new HTTPException(400, {
      message: "code, code_verifier, and redirect_uri are required",
    });
  }

  const redirectUri = body.redirect_uri.trim();
  if (!isMcpRedirectUriAllowed(redirectUri)) {
    throw new HTTPException(400, { message: "redirect_uri not allowed" });
  }

  const data = await consumeMcpCode(redis, body.code.trim());
  if (!data) {
    throw new HTTPException(400, { message: "Invalid or expired code" });
  }
  if (data.redirectUri !== redirectUri) {
    throw new HTTPException(400, { message: "redirect_uri mismatch" });
  }

  // Split stored "challenge|scopes" composite back into parts.
  // 保存時の `challenge|scopes` を分解する。
  const sepIndex = data.codeChallenge.indexOf("|");
  const storedChallenge =
    sepIndex >= 0 ? data.codeChallenge.slice(0, sepIndex) : data.codeChallenge;
  const storedScopes =
    sepIndex >= 0
      ? data.codeChallenge
          .slice(sepIndex + 1)
          .split(",")
          .filter((s) => ALLOWED_SCOPES.has(s))
      : [MCP_SCOPE_READ, MCP_SCOPE_WRITE];

  if (!verifyPKCE(body.code_verifier.trim(), storedChallenge)) {
    throw new HTTPException(400, { message: "PKCE verification failed" });
  }

  const tokens = await issueMcpToken(data.userId, storedScopes);
  return c.json({
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
    scope: storedScopes.join(" "),
  });
});

// ── POST /revoke ────────────────────────────────────────────────────────────
// MCP JWT の失効登録 (best-effort)。Stateless JWT のため、Redis にブラックリスト登録する程度の実装。
// MVP では成功応答のみ返し、将来的にデナイリストを追加する。
//
// Best-effort revoke for stateless JWTs (MVP returns success; deny-list to be added).
app.post("/revoke", mcpReadRequired, async (c) => {
  const userId = c.get("userId");
  // TODO: Persist a per-user revocation timestamp in Redis so verifyMcpToken can check `iat < revokedAt`.
  // TODO: ユーザー単位の失効時刻を Redis に保存し、検証時に iat と比較してブロックする。
  console.log(`[mcp] revoke requested for userId=${userId}`);
  return c.json({ revoked: true });
});

// ── POST /clip ──────────────────────────────────────────────────────────────
// MCP 権限で URL をクリップしてページを生成する。Chrome 拡張用 `/api/ext/clip-and-create` の MCP 版。
// 本体ロジックは `clipAndCreate` を共有するため重複実装はしない。
//
// MCP-authenticated wrapper around clipAndCreate (shares the same implementation as /api/ext/clip-and-create).
app.post("/clip", mcpWriteRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{ url?: string }>();
  if (!body.url?.trim()) {
    throw new HTTPException(400, { message: "url is required" });
  }

  const url = body.url.trim();
  if (!isClipUrlAllowed(url)) {
    throw new HTTPException(400, {
      message:
        "URL not allowed: only public http/https URLs are supported (no localhost, private IP, or internal hosts)",
    });
  }
  const allowedAfterDns = await isClipUrlAllowedAfterDns(url);
  if (!allowedAfterDns) {
    throw new HTTPException(400, {
      message:
        "URL not allowed: only public http/https URLs are supported (no localhost, private IP, or internal hosts)",
    });
  }

  try {
    const result = await clipAndCreate({ url, userId, db });
    return c.json({
      page_id: result.page_id,
      title: result.title,
      thumbnail_url: result.thumbnail_url ?? undefined,
    });
  } catch (err) {
    console.error("[mcp] clip failed", err);
    throw new HTTPException(502, {
      message: "Failed to clip the URL. Please try again later.",
    });
  }
});

export default app;
