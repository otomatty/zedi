import { Hono } from "hono";
import type { Env } from "../types/env";
import type {
  ImageGenerateRequest,
  ImageGenerateResponse,
} from "../types/api";
import { generateImageWithGemini } from "../services/generation/gemini";

const route = new Hono<{ Bindings: Env }>();

route.post("/image-generate", async (c) => {
  let body: ImageGenerateRequest | null = null;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }

  if (!body?.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  if (!c.env.GOOGLE_GEMINI_API_KEY) {
    return c.json(
      { error: "Google Gemini API key is not configured" },
      500
    );
  }

  try {
    const result = await generateImageWithGemini(
      body.prompt,
      c.env.GOOGLE_GEMINI_API_KEY,
      {
        aspectRatio: body.aspectRatio,
      }
    );

    const response: ImageGenerateResponse = {
      imageUrl: result.imageUrl,
      mimeType: result.mimeType,
    };

    return c.json(response);
  } catch (error) {
    console.error("image-generate failed", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "画像生成に失敗しました",
      },
      500
    );
  }
});

export default route;
