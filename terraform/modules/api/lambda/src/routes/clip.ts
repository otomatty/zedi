/**
 * /api/clip — Web クリッピング
 *
 * POST /api/clip/fetch — URL から HTML をサーバーサイドで取得
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRequired } from '../middleware/auth';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.post('/fetch', authRequired, async (c) => {
  const body = await c.req.json<{ url?: string }>();

  if (!body.url?.trim()) {
    throw new HTTPException(400, { message: 'url is required' });
  }

  const url = body.url.trim();

  // URL バリデーション
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new HTTPException(400, { message: 'Only http/https URLs are supported' });
    }
  } catch {
    throw new HTTPException(400, { message: 'Invalid URL' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'zedi-clip/1.0 (https://zedi.app)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HTTPException(502, {
        message: `Fetch failed: ${response.status}`,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    return c.json({
      html,
      url: response.url, // final URL after redirects
      content_type: contentType,
    });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Request timed out'
        : 'Fetch failed';
    throw new HTTPException(502, { message });
  } finally {
    clearTimeout(timeout);
  }
});

export default app;
