/**
 * POST /api/thumbnail/commit — サムネイル画像コミット (S3 保存)
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRequired } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/rateLimiter';
import { getEnvConfig } from '../../env';
import { commitImage } from '../../services/commitService';
import type { AppEnv } from '../../types';

const app = new Hono<AppEnv>();

app.post('/', authRequired, rateLimiter, async (c) => {
  const userId = c.get('userId');
  const db = c.get('db');
  const env = getEnvConfig();

  const body = await c.req.json<{
    sourceUrl?: string;
    title?: string;
    fallbackUrl?: string;
  }>();

  if (!body.sourceUrl?.trim()) {
    throw new HTTPException(400, { message: 'sourceUrl is required' });
  }

  const { imageUrl } = await commitImage(
    userId,
    body.sourceUrl.trim(),
    body.fallbackUrl?.trim(),
    env,
    db,
  );

  return c.json({ imageUrl, provider: 's3' as const });
});

export default app;
