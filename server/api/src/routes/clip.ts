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
import { validateModelAccessOrThrow } from "../lib/aiAccessHelpers.js";
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
    // YouTube Shorts (m. サブドメイン含む) は本流の抽出パイプラインで受理されるため、
    // POST /api/clip/youtube だけが弾かないように同等のパターンを追加する。
    // 11 文字 ID の後に `/` `?` `#` のいずれが来ても受理する（articleExtractor と整合）。
    // YouTube Shorts URLs are accepted by the main extraction pipeline; mirror
    // them here so this endpoint doesn't reject them with a 400. Allow `/`, `?`,
    // or `#` after the 11-char ID to match articleExtractor's pattern (e.g.
    // `/shorts/<id>/`, `/shorts/<id>?si=...`).
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[/?#][^\s]*)?$/i,
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
  // `aiModel` は `aiModels.id` (例: "openai:gpt-4o") を保持し、
  // `validateModelAccess` / `recordUsage` のキーとして使う。
  // `apiModelId` はプロバイダー API 呼び出し用の生モデル名 (例: "gpt-4o") で
  // YouTube extractor 経由でプロバイダー SDK に渡す。
  // `aiModel` keeps the catalog id (e.g. "openai:gpt-4o") used as the key for
  // `validateModelAccess` / `recordUsage`. `apiModelId` is the provider-facing
  // model name (e.g. "gpt-4o") forwarded to the provider SDK via the extractor.
  let aiProvider: AIProviderType | undefined;
  let aiModel: string | undefined;
  let apiModelId: string | undefined;
  let aiApiKey: string | undefined;

  const supportedProviders: AIProviderType[] = ["openai", "anthropic", "google"];

  // provider/model は両方指定するか両方省略する必要がある（ext.ts の /clip-and-create と一致させる）
  // provider/model must be specified together or both omitted (consistent with ext.ts /clip-and-create)
  const hasProvider = typeof body.provider === "string" && body.provider.trim().length > 0;
  const hasModel = typeof body.model === "string" && body.model.trim().length > 0;
  if (hasProvider !== hasModel) {
    throw new HTTPException(400, {
      message: "provider and model must be specified together",
    });
  }

  if (hasProvider && hasModel) {
    const providerInput = (body.provider as string).trim() as AIProviderType;
    const modelInput = (body.model as string).trim();
    if (!supportedProviders.includes(providerInput)) {
      throw new HTTPException(400, { message: `unsupported provider: ${providerInput}` });
    }
    aiProvider = providerInput;
    aiModel = modelInput;

    // モデルアクセス・利用量チェック / Model access & usage enforcement
    // 既知の検証エラーは HTTPException(400/403) として返す
    // Known validation errors are translated to HTTPException(400/403)
    const tier = await getUserTier(userId, db);
    const modelInfo = await validateModelAccessOrThrow(aiModel, tier, db);
    const usageCheck = await checkUsage(userId, tier, db);
    if (!usageCheck.allowed) {
      throw new HTTPException(429, { message: "Monthly budget exceeded" });
    }

    // モデル情報から provider を上書き（DB 上の provider が正）
    // Override provider from model info (DB is authoritative)
    // API キーは上書き後の provider で取得する（provider 不一致バグ防止）
    // `aiModel` は catalog id のまま保持し、プロバイダー SDK 用に
    // `apiModelId` を別変数で保持する。両者を混同すると validateModelAccess /
    // recordUsage が apiModelId で aiModels.id を引いてしまい、catch に落ちて
    // 課金記録が静かにスキップされる。
    // Keep `aiModel` as the catalog id; expose `apiModelId` separately for the
    // provider SDK. Mixing them silently breaks usage accounting because
    // validateModelAccess looks up `aiModels.id` and the apiModelId form will
    // not match, swallowed by the non-fatal catch below.
    aiProvider = modelInfo.provider as AIProviderType;
    apiModelId = modelInfo.apiModelId;

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
      // プロバイダー SDK には provider 側のモデル名を渡す。
      // Pass the provider-facing model name to the SDK.
      aiModel: apiModelId,
      aiApiKey,
    });

    // 使用量記録 / Record usage
    // result.aiUsage が null でない場合のみ課金（AI が実際に成功した場合）
    // 記録失敗は非致命的 — 抽出結果を破棄しない
    // Bill only when AI actually ran successfully (result.aiUsage !== null)
    // Recording failure is non-fatal — don't discard the extraction result
    //
    // ここではアクセス検証時にトリム済みの aiModel を使う。生の `body.model` には
    // 前後空白や別表記が含まれうるため、`validateModelAccess` の再検証も
    // recordUsage の保存値もトリム後の正規 model id (`aiModel`) で行わないと、
    // 同一モデルが複数の正規化前文字列で記録され、使用量集計や請求がブレる。
    // Use the already-trimmed `aiModel` for re-validation and accounting so usage
    // records are stable for the same model regardless of input whitespace.
    if (result.aiUsage && aiProvider && aiModel) {
      try {
        // プロバイダーから返された実際のトークン数を使用（概算ではなく）
        // Use actual token counts returned by the provider (not estimates)
        const { inputTokens, outputTokens } = result.aiUsage;
        const tier = await getUserTier(userId, db);
        const modelInfo = await validateModelAccess(aiModel, tier, db);
        const costUnits = calculateCost(
          { inputTokens, outputTokens },
          modelInfo.inputCostUnits,
          modelInfo.outputCostUnits,
        );
        await recordUsage(
          userId,
          aiModel,
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
