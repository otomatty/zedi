/**
 * GET /api/thumbnail/image-search — サムネイル画像検索
 */
import { Hono } from 'hono';
import { authRequired } from '../../middleware/auth';
import { rateLimiter } from '../../middleware/rateLimiter';
import { getEnvConfig } from '../../env';
import { getThumbnailSecrets, getRequired } from '../../lib/secrets';
import { searchImages } from '../../services/imageSearch';
import type { AppEnv, ImageSearchResponse } from '../../types';

const app = new Hono<AppEnv>();

app.get('/', authRequired, rateLimiter, async (c) => {
  const env = getEnvConfig();

  const query = c.req.query('query')?.trim() || '';
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 10), 1), 30);
  const cursor = Math.max(Number(c.req.query('cursor') || 1), 1);

  if (!query) {
    return c.json({ items: [], nextCursor: undefined } satisfies ImageSearchResponse);
  }

  const secrets = await getThumbnailSecrets(env.THUMBNAIL_SECRETS_ARN);
  const apiKey = getRequired(secrets, 'GOOGLE_CUSTOM_SEARCH_API_KEY');
  const engineId = getRequired(secrets, 'GOOGLE_CUSTOM_SEARCH_ENGINE_ID');

  const items = await searchImages(query, apiKey, engineId, cursor, limit);

  // 重複除去
  const seen = new Set<string>();
  const unique: typeof items = [];
  for (const item of items) {
    if (seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  const nextCursor =
    unique.length === 0 || cursor * limit >= 100 ? undefined : String(cursor + 1);

  return c.json({ items: unique, nextCursor } satisfies ImageSearchResponse);
});

export default app;
