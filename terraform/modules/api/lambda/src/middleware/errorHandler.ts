/**
 * グローバルエラーハンドラー
 *
 * Hono の onError フックで使用。
 * HTTPException はそのままステータスコードを返し、
 * Aurora auto-pause からの復帰中は 503 + Retry-After を返し、
 * それ以外は 500 Internal Server Error を返す。
 */
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types';

/**
 * DatabaseResumingException をエラーチェーン (cause) から検知する。
 * RDS Data API SDK が返すエラーは cause チェーンに埋まっている場合がある。
 */
function isDatabaseResumingError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') return false;
    const name = (current as { name?: string }).name ?? '';
    const message = (current as { message?: string }).message ?? '';
    if (
      name === 'DatabaseResumingException' ||
      message.includes('is resuming after being auto-paused')
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  // ── Aurora auto-pause 復帰中の検知 ──
  if (isDatabaseResumingError(err)) {
    console.warn(`[api] ${c.req.method} ${c.req.path} → 503 Aurora resuming`);
    c.header('Retry-After', '10');
    return c.json(
      { error: 'Database is resuming', code: 'DATABASE_RESUMING' },
      503,
    );
  }

  if (err instanceof HTTPException) {
    const status = err.status;
    console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err.message);
    return c.json({ error: err.message }, status);
  }

  // 既知のエラーメッセージからステータスコードを判定
  const message = err instanceof Error ? err.message : 'Internal server error';
  const statusMap: Record<string, number> = {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    RATE_LIMIT_EXCEEDED: 429,
    STORAGE_QUOTA_EXCEEDED: 403,
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    CONFLICT: 409,
  };
  const status = statusMap[message] ?? 500;

  console.error(`[api] ${c.req.method} ${c.req.path} → ${status}`, err);
  return c.json({ error: message }, status as 401);
};
