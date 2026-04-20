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
import { resolveAiConfigForRequest } from "../lib/aiAccessHelpers.js";
import { calculateCost, recordUsage } from "../services/usageService.js";
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

  // AI 要約の設定（ext.ts の /clip-and-create と検証ロジックを共通化）
  // AI summary configuration (validation/access-control shared with
  // ext.ts /clip-and-create via resolveAiConfigForRequest()).
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
    const result = await extractYouTubeContent({
      videoId,
      youtubeApiKey,
      aiProvider,
      aiModel,
      aiApiKey,
    });

    // 使用量記録 / Record usage
    // result.aiUsage が null でない場合のみ課金（AI が実際に成功した場合）
    // 記録失敗は非致命的 — 抽出結果を破棄しない
    // resolveAiConfigForRequest() がアクセスチェック時に取得した tier / modelInfo
    // をそのまま再利用し、同一リクエスト内での DB クエリ重複を避ける。
    // Bill only when AI actually ran successfully (result.aiUsage !== null).
    // Reuse the tier / modelInfo captured during resolveAiConfigForRequest()
    // to avoid duplicate DB queries within the same request.
    if (result.aiUsage && aiConfig) {
      try {
        const { inputTokens, outputTokens } = result.aiUsage;
        const { modelInfo, internalModelId } = aiConfig;
        const costUnits = calculateCost(
          { inputTokens, outputTokens },
          modelInfo.inputCostUnits,
          modelInfo.outputCostUnits,
        );
        await recordUsage(
          userId,
          internalModelId,
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
    // HTTPException（4xx 等）はそのままのステータスで伝播させる。
    // /fetch ハンドラと同じパターンに合わせる。
    // Preserve HTTPException status codes (4xx etc.); mirrors the /fetch handler.
    if (err instanceof HTTPException) throw err;
    const msg = err instanceof Error ? err.message : "YouTube extraction failed";
    throw new HTTPException(502, { message: msg });
  }
});

export default app;
