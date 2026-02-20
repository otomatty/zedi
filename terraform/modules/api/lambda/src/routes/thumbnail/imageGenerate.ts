/**
 * POST /api/thumbnail/image-generate — Gemini 画像生成
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRequired } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/rateLimiter';
import { getEnvConfig } from '../../env';
import { getAISecrets, getRequired } from '../../lib/secrets';
import { generateImageWithGemini } from '../../services/gemini';
import type { AppEnv, ImageGenerateResponse } from '../../types';

const app = new Hono<AppEnv>();

app.post('/', authRequired, rateLimiter, async (c) => {
  const env = getEnvConfig();

  const body = await c.req.json<{ prompt?: string; aspectRatio?: string }>();

  if (!body.prompt?.trim()) {
    throw new HTTPException(400, { message: 'prompt is required' });
  }

  const secrets = await getAISecrets(env.AI_SECRETS_ARN);
  const apiKey = getRequired(secrets, 'GOOGLE_AI_API_KEY');

  const result = await generateImageWithGemini(body.prompt.trim(), apiKey, {
    aspectRatio: body.aspectRatio || '16:9',
  });

  return c.json({
    imageUrl: result.imageUrl,
    mimeType: result.mimeType,
  } satisfies ImageGenerateResponse);
});

export default app;
