/**
 * /api/ext — Chrome 拡張専用 API
 *
 * POST /api/ext/session     — OAuth code + PKCE でトークン発行
 * POST /api/ext/clip-and-create — ワンクリック保存
 * POST /api/ext/authorize-code — 認証済みセッションでワンタイムコード発行（ExtensionAuthCallback用）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import { extAuthRequired } from "../middleware/extAuth.js";
import { randomBytes } from "node:crypto";
import {
  consumeExtensionCode,
  verifyPKCE,
  isRedirectUriAllowed,
  issueExtensionToken,
  storeExtensionCode,
} from "../lib/extAuth.js";
import { clipAndCreate } from "../lib/clipAndCreate.js";
import { isClipUrlAllowed } from "../lib/clipUrlPolicy.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── POST /session ─────────────────────────────────────────────────────────
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
  if (!isRedirectUriAllowed(redirectUri)) {
    throw new HTTPException(400, { message: "redirect_uri not allowed" });
  }

  const data = await consumeExtensionCode(redis, body.code.trim());
  if (!data) {
    throw new HTTPException(400, { message: "Invalid or expired code" });
  }

  if (!verifyPKCE(body.code_verifier.trim(), data.codeChallenge)) {
    throw new HTTPException(400, { message: "PKCE verification failed" });
  }

  const tokens = await issueExtensionToken(data.userId);
  return c.json({
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
  });
});

// ── GET /authorize-code ────────────────────────────────────────────────────
// 認証済みセッションでワンタイムコード発行。ExtensionAuthCallback が呼ぶ。
app.get("/authorize-code", authRequired, async (c) => {
  const redis = c.get("redis");
  if (!redis) {
    throw new HTTPException(503, { message: "Redis unavailable" });
  }

  const redirectUri = c.req.query("redirect_uri")?.trim();
  const codeChallenge = c.req.query("code_challenge")?.trim();
  const state = c.req.query("state") ?? "";

  if (!redirectUri || !codeChallenge) {
    throw new HTTPException(400, {
      message: "redirect_uri and code_challenge are required",
    });
  }

  if (!isRedirectUriAllowed(redirectUri)) {
    throw new HTTPException(400, { message: "redirect_uri not allowed" });
  }

  const userId = c.get("userId");
  const code = randomBytes(32).toString("base64url");
  await storeExtensionCode(redis, code, userId, codeChallenge);

  return c.json({ code, state });
});

// ── POST /authorize-code ────────────────────────────────────────────────────
// Called by ExtensionAuthCallback page (with session cookie) to issue one-time code.
app.post("/authorize-code", authRequired, async (c) => {
  const redis = c.get("redis");
  if (!redis) {
    throw new HTTPException(503, { message: "Redis unavailable" });
  }

  const body = await c.req.json<{
    redirect_uri?: string;
    code_challenge?: string;
    state?: string;
  }>();

  if (!body.redirect_uri?.trim() || !body.code_challenge?.trim()) {
    throw new HTTPException(400, {
      message: "redirect_uri and code_challenge are required",
    });
  }

  const redirectUri = body.redirect_uri.trim();
  if (!isRedirectUriAllowed(redirectUri)) {
    throw new HTTPException(400, { message: "redirect_uri not allowed" });
  }

  const userId = c.get("userId");
  const code = randomBytes(32).toString("base64url");
  await storeExtensionCode(redis, code, userId, body.code_challenge.trim());

  return c.json({
    code,
    state: body.state ?? "",
  });
});

// ── POST /clip-and-create ──────────────────────────────────────────────────
app.post("/clip-and-create", extAuthRequired, async (c) => {
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

  try {
    const result = await clipAndCreate({ url, userId, db });
    return c.json({
      page_id: result.page_id,
      title: result.title,
      thumbnail_url: result.thumbnail_url ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clip failed";
    throw new HTTPException(502, { message });
  }
});

export default app;
