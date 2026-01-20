import { Hono } from "hono";
import type { Env } from "../types/env";
import type { ThumbnailCommitRequest, ThumbnailCommitResponse } from "../types/api";
import { uploadToGyazo } from "../services/gyazo";

const route = new Hono<{ Bindings: Env }>();

route.post("/thumbnail/commit", async (c) => {
  let body: ThumbnailCommitRequest | null = null;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }

  if (!body?.sourceUrl) {
    return c.json({ error: "sourceUrl is required" }, 400);
  }

  const headerToken =
    c.req.header("x-gyazo-access-token") ||
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const accessToken = headerToken || c.env.GYAZO_ACCESS_TOKEN;

  if (!accessToken) {
    return c.json({ error: "Gyazo access token is required" }, 400);
  }

  try {
    const result = await uploadToGyazo(
      body.sourceUrl,
      accessToken,
      body.title,
      body.fallbackUrl
    );
    const response: ThumbnailCommitResponse = {
      imageUrl: result.imageUrl,
      permalinkUrl: result.permalinkUrl,
      provider: "gyazo",
    };
    return c.json(response);
  } catch (error) {
    console.error("thumbnail/commit failed", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "アップロードに失敗しました",
      },
      500
    );
  }
});

export default route;
