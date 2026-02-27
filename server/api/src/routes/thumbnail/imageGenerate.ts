import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../../middleware/auth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { generateImageWithGemini } from "../../services/gemini.js";
import type { AppEnv, ImageGenerateResponse } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.post("/", authRequired, rateLimit(), async (c) => {
  const body = await c.req.json<{ prompt?: string; aspectRatio?: string }>();

  if (!body.prompt?.trim()) {
    throw new HTTPException(400, { message: "prompt is required" });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(503, { message: "Google AI API key not configured" });
  }

  const result = await generateImageWithGemini(body.prompt.trim(), apiKey, {
    aspectRatio: body.aspectRatio || "16:9",
  });

  return c.json({
    imageUrl: result.imageUrl,
    mimeType: result.mimeType,
  } satisfies ImageGenerateResponse);
});

export default app;
