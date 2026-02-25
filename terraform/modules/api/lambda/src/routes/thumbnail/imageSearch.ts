/**
 * GET /api/thumbnail/image-search — サムネイル画像検索
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth";
import { rateLimiter } from "../../middleware/rateLimiter";
import { getEnvConfig } from "../../env";
import { getThumbnailSecrets, getRequired } from "../../lib/secrets";
import { searchImages } from "../../services/imageSearch";
import type { AppEnv, ImageSearchResponse } from "../../types";

const app = new Hono<AppEnv>();

app.get("/", authRequired, rateLimiter, async (c) => {
  const env = getEnvConfig();

  const query = c.req.query("query")?.trim() || "";
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 10), 1), 30);
  const cursor = Math.max(Number(c.req.query("cursor") || 1), 1);

  if (!query) {
    return c.json({ items: [], nextCursor: undefined } satisfies ImageSearchResponse);
  }

  if (!env.THUMBNAIL_SECRETS_ARN) {
    throw new HTTPException(503, {
      message: "画像検索は現在利用できません（API キーが未設定です）",
    });
  }

  let apiKey: string;
  let engineId: string;
  try {
    const secrets = await getThumbnailSecrets(env.THUMBNAIL_SECRETS_ARN);
    apiKey = getRequired(secrets, "GOOGLE_CUSTOM_SEARCH_API_KEY");
    engineId = getRequired(secrets, "GOOGLE_CUSTOM_SEARCH_ENGINE_ID");
  } catch (err) {
    console.error("Failed to load thumbnail secrets:", err);
    throw new HTTPException(503, {
      message: "画像検索は現在利用できません（API キーの取得に失敗しました）",
    });
  }

  let items: Awaited<ReturnType<typeof searchImages>>;
  try {
    items = await searchImages(query, apiKey, engineId, cursor, limit);
  } catch (err) {
    console.error("Image search failed:", err);
    throw new HTTPException(502, {
      message: "画像検索に失敗しました。しばらくしてからもう一度お試しください。",
    });
  }

  // 重複除去
  const seen = new Set<string>();
  const unique: typeof items = [];
  for (const item of items) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  const nextCursor = unique.length === 0 || cursor * limit >= 100 ? undefined : String(cursor + 1);

  return c.json({ items: unique, nextCursor } satisfies ImageSearchResponse);
});

export default app;
