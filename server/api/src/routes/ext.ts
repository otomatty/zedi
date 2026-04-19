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
import { isClipUrlAllowed, isClipUrlAllowedAfterDns } from "../lib/clipUrlPolicy.js";
import { resolveAiConfigForRequest } from "../lib/aiAccessHelpers.js";
import { getUserTier } from "../services/subscriptionService.js";
import { validateModelAccess, calculateCost, recordUsage } from "../services/usageService.js";
import type { AppEnv, AIProviderType } from "../types/index.js";

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
  if (data.redirectUri !== redirectUri) {
    throw new HTTPException(400, { message: "redirect_uri mismatch" });
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
  await storeExtensionCode(redis, code, userId, codeChallenge, redirectUri);

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
  await storeExtensionCode(redis, code, userId, body.code_challenge.trim(), redirectUri);

  return c.json({
    code,
    state: body.state ?? "",
  });
});

// ── POST /clip-and-create ──────────────────────────────────────────────────
// 制約: isClipUrlAllowedAfterDns の DNS 検証と、後段の fetch(url) の名前解決は別タイミングのため、
// DNS rebinding（検証時は public IP でも fetch 時に private へ再解決されうる）の TOCTOU が残る。
// Limitation: DNS check and fetch use separate lookups; DNS rebinding (TOCTOU) is not fully mitigated.
app.post("/clip-and-create", extAuthRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: { url?: string; provider?: string; model?: string };
  try {
    body = await c.req.json<{ url?: string; provider?: string; model?: string }>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
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

  // YouTube 要約用の AI パラメータ / AI params for YouTube summary
  // 検証・アクセス制御は clip.ts の /youtube と共通化された
  // resolveAiConfigForRequest() に委譲する。
  // Validation / access-control logic is shared with clip.ts /youtube via
  // resolveAiConfigForRequest().
  const youtubeApiKey = process.env.YOUTUBE_DATA_API_KEY;
  const clientModelId = body.model; // 使用量記録用の元のモデル ID
  // Original client-supplied model ID (before resolution) for usage recording

  const aiConfig = await resolveAiConfigForRequest({
    userId,
    db,
    provider: body.provider,
    model: body.model,
  });
  const aiProvider: AIProviderType | undefined = aiConfig?.provider;
  const aiModel: string | undefined = aiConfig?.apiModelId;
  const aiApiKey: string | undefined = aiConfig?.apiKey;

  try {
    const result = await clipAndCreate({
      url,
      userId,
      db,
      youtubeApiKey,
      aiProvider,
      aiModel,
      aiApiKey,
    });

    // 使用量記録 / Record usage
    // result.ai_usage が null でない場合のみ課金（AI が実際に成功した場合）
    // 記録失敗は非致命的
    // Bill only when AI actually ran successfully (result.ai_usage !== null)
    // Recording failure is non-fatal
    if (result.ai_usage && aiProvider && clientModelId) {
      try {
        const { inputTokens, outputTokens } = result.ai_usage;
        const tier = await getUserTier(userId, db);
        const modelInfo = await validateModelAccess(clientModelId, tier, db);
        const costUnits = calculateCost(
          { inputTokens, outputTokens },
          modelInfo.inputCostUnits,
          modelInfo.outputCostUnits,
        );
        await recordUsage(
          userId,
          clientModelId,
          "youtube_summary",
          { inputTokens, outputTokens },
          costUnits,
          "system",
          db,
        );
      } catch (usageErr) {
        console.error("YouTube usage recording failed (non-fatal):", usageErr);
      }
    }

    return c.json({
      page_id: result.page_id,
      title: result.title,
      thumbnail_url: result.thumbnail_url ?? undefined,
    });
  } catch (err) {
    console.error("clip-and-create failed", err);
    throw new HTTPException(502, {
      message: "Failed to clip the URL. Please try again later.",
    });
  }
});

export default app;
