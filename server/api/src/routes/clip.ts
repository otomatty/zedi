/**
 * /api/clip — Web クリッピング
 *
 * POST /api/clip/fetch — URL から HTML をサーバーサイドで取得（SSRF 対策あり）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { ClipFetchBlockedError, fetchClipHtmlWithRedirects } from "../lib/clipServerFetch.js";
import { extractYouTubeContent } from "../lib/youtubeExtractor.js";
import { getProviderApiKeyName } from "../services/aiProviders.js";
import { getUserTier } from "../services/subscriptionService.js";
import {
  checkUsage,
  validateModelAccess,
  calculateCost,
  recordUsage,
} from "../services/usageService.js";
import type { AppEnv, AIProviderType } from "../types/index.js";

const app = new Hono<AppEnv>();

app.post("/fetch", authRequired, async (c) => {
  const body = await c.req.json<{ url?: string }>();

  if (!body.url?.trim()) {
    throw new HTTPException(400, { message: "url is required" });
  }

  const url = body.url.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    try {
      const { html, finalUrl, contentType } = await fetchClipHtmlWithRedirects(url, controller);
      return c.json({
        html,
        url: finalUrl,
        content_type: contentType,
      });
    } catch (err) {
      if (err instanceof ClipFetchBlockedError) {
        throw new HTTPException(400, { message: err.message });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new HTTPException(502, { message: "Request timed out" });
    }
    if (err instanceof Error && err.message.startsWith("Fetch failed:")) {
      throw new HTTPException(502, { message: err.message });
    }
    throw new HTTPException(502, { message: "Fetch failed" });
  } finally {
    clearTimeout(timeout);
  }
});

// ── POST /youtube ────────────────────────────────────────────────────────
// YouTube URL からメタデータ + 字幕 + AI 要約を取得し、Tiptap JSON を返す。
// Fetches YouTube metadata + transcript + AI summary and returns Tiptap JSON.

/**
 * YouTube クリップのリクエストボディ。
 * Request body for POST /api/clip/youtube.
 */
interface YouTubeClipBody {
  url?: string;
  provider?: AIProviderType;
  model?: string;
}

/**
 * YouTube URL から動画 ID を抽出する。
 * Extracts a YouTube video ID from various URL formats.
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^&]+&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)?$/i,
    /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/i,
    /^https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

app.post("/youtube", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: YouTubeClipBody;
  try {
    body = await c.req.json<YouTubeClipBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (!body.url?.trim()) {
    throw new HTTPException(400, { message: "url is required" });
  }

  const url = body.url.trim();
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new HTTPException(400, { message: "URL is not a valid YouTube video URL" });
  }

  const youtubeApiKey = process.env.YOUTUBE_DATA_API_KEY;

  // AI 要約の設定 / AI summary configuration
  let aiProvider: AIProviderType | undefined;
  let aiModel: string | undefined;
  let aiApiKey: string | undefined;

  const supportedProviders: AIProviderType[] = ["openai", "anthropic", "google"];
  if (body.provider && body.model) {
    if (!supportedProviders.includes(body.provider)) {
      throw new HTTPException(400, { message: `unsupported provider: ${body.provider}` });
    }
    aiProvider = body.provider;
    aiModel = body.model;

    // モデルアクセス・利用量チェック / Model access & usage enforcement
    const tier = await getUserTier(userId, db);
    const modelInfo = await validateModelAccess(aiModel, tier, db);
    const usageCheck = await checkUsage(userId, tier, db);
    if (!usageCheck.allowed) {
      throw new HTTPException(429, { message: "Monthly budget exceeded" });
    }

    // モデル情報から provider を上書き（DB 上の provider が正）
    // Override provider from model info (DB is authoritative)
    // API キーは上書き後の provider で取得する（provider 不一致バグ防止）
    aiProvider = modelInfo.provider as AIProviderType;
    aiModel = modelInfo.apiModelId;

    const apiKeyName = getProviderApiKeyName(aiProvider);
    aiApiKey = process.env[apiKeyName];
    if (!aiApiKey) {
      throw new HTTPException(503, { message: `API key not configured: ${apiKeyName}` });
    }
  }

  try {
    const result = await extractYouTubeContent({
      videoId,
      youtubeApiKey,
      aiProvider,
      aiModel,
      aiApiKey,
    });

    // 使用量記録 / Record usage (if AI was used)
    // 記録失敗は非致命的 — 抽出結果を破棄しない
    // Recording failure is non-fatal — don't discard the extraction result
    if (aiProvider && aiModel && body.model) {
      try {
        const contentLen = JSON.stringify(result.tiptapJson).length;
        const inputTokens = Math.ceil(contentLen / 4);
        const outputTokens = Math.ceil((result.contentText?.length ?? 0) / 4);
        const tier = await getUserTier(userId, db);
        const modelInfo = await validateModelAccess(body.model, tier, db);
        const costUnits = calculateCost(
          { inputTokens, outputTokens },
          modelInfo.inputCostUnits,
          modelInfo.outputCostUnits,
        );
        await recordUsage(
          userId,
          body.model,
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
      title: result.title,
      thumbnailUrl: result.thumbnailUrl,
      tiptapJson: result.tiptapJson,
      contentText: result.contentText,
      contentHash: result.contentHash,
      sourceUrl: result.finalUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "YouTube extraction failed";
    throw new HTTPException(502, { message: msg });
  }
});

export default app;
