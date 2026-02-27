import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { searchImages } from "../../services/imageSearch.js";
import type { AppEnv, ImageSearchResponse } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.get("/", authRequired, rateLimit(), async (c) => {
  const query = c.req.query("query")?.trim() || "";
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 10), 1), 30);
  const cursor = Math.max(Number(c.req.query("cursor") || 1), 1);

  if (!query) {
    return c.json({ items: [], nextCursor: undefined } satisfies ImageSearchResponse);
  }

  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    throw new HTTPException(503, {
      message: "画像検索は現在利用できません（API キーが未設定です）",
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
