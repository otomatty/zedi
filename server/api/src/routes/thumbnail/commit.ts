import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { commitImage } from "../../services/commitService.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.post("/", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    sourceUrl?: string;
    title?: string;
    fallbackUrl?: string;
  }>();

  if (!body.sourceUrl?.trim()) {
    throw new HTTPException(400, { message: "sourceUrl is required" });
  }

  if (!process.env.STORAGE_BUCKET_NAME) {
    throw new HTTPException(503, { message: "サムネイルの保存先が設定されていません" });
  }

  try {
    const { imageUrl } = await commitImage(
      userId,
      body.sourceUrl.trim(),
      body.fallbackUrl?.trim(),
      db,
    );
    return c.json({ imageUrl, provider: "s3" as const });
  } catch (err) {
    if (err instanceof Error && err.message === "STORAGE_QUOTA_EXCEEDED") {
      throw new HTTPException(413, {
        message: "ストレージの容量制限に達しました。不要な画像を削除してください。",
      });
    }
    console.error("Thumbnail commit failed:", err);
    throw new HTTPException(502, {
      message: "サムネイルの保存に失敗しました。しばらくしてからもう一度お試しください。",
    });
  }
});

export default app;
