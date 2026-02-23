import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorHandler } from '../../middleware/errorHandler';

vi.mock('../../env', () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: '*', MEDIA_BUCKET: 'b', AI_SECRETS_ARN: 'a', RATE_LIMIT_TABLE: 'r',
    THUMBNAIL_SECRETS_ARN: 'a', THUMBNAIL_BUCKET: 'b', THUMBNAIL_CLOUDFRONT_URL: 'https://t',
    ENVIRONMENT: 'test', POLAR_SECRET_ARN: 'a', COGNITO_USER_POOL_ID: 'p',
    COGNITO_REGION: 'us-east-1', AURORA_CLUSTER_ARN: 'a', DB_CREDENTIALS_SECRET: 'a',
    AURORA_DATABASE_NAME: 'zedi',
  })),
  resetEnvCache: vi.fn(),
}));

function createTestApp(thrower: () => never) {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/test', () => thrower());
  return app;
}

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('DatabaseResumingException', () => {
    it('should return 503 with Retry-After for DatabaseResumingException', async () => {
      const err = new Error('DB error');
      err.name = 'DatabaseResumingException';
      const app = createTestApp(() => { throw err; });

      const res = await app.request('/test');

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('10');
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Database is resuming');
      expect(body.code).toBe('DATABASE_RESUMING');
    });

    it('should return 503 for nested cause chain containing DatabaseResumingException', async () => {
      const inner = new Error('inner');
      inner.name = 'DatabaseResumingException';
      const mid = new Error('mid', { cause: inner });
      const outer = new Error('outer', { cause: mid });
      const app = createTestApp(() => { throw outer; });

      const res = await app.request('/test');

      expect(res.status).toBe(503);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('DATABASE_RESUMING');
    });

    it('should return 503 when message contains "is resuming after being auto-paused"', async () => {
      const err = new Error('Cluster is resuming after being auto-paused');
      const app = createTestApp(() => { throw err; });

      const res = await app.request('/test');

      expect(res.status).toBe(503);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe('DATABASE_RESUMING');
    });
  });

  describe('HTTPException', () => {
    it('should return correct status for HTTPException', async () => {
      const app = createTestApp(() => {
        throw new HTTPException(403, { message: 'Forbidden' });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(403);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('known error messages', () => {
    it.each([
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['RATE_LIMIT_EXCEEDED', 429],
      ['STORAGE_QUOTA_EXCEEDED', 403],
      ['NOT_FOUND', 404],
      ['BAD_REQUEST', 400],
      ['CONFLICT', 409],
    ] as const)('should map %s to %d', async (message, expectedStatus) => {
      const app = createTestApp(() => { throw new Error(message); });

      const res = await app.request('/test');

      expect(res.status).toBe(expectedStatus);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe(message);
    });
  });

  describe('unknown errors', () => {
    it('should return 500 for unknown errors', async () => {
      const app = createTestApp(() => { throw new Error('Something unexpected'); });

      const res = await app.request('/test');

      expect(res.status).toBe(500);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Something unexpected');
    });

    it('should return 500 with generic message for non-Error values', async () => {
      const fakeCtx = {
        req: { method: 'GET', path: '/test' },
        header: vi.fn(),
        json: vi.fn((body: unknown, status: number) => Response.json(body, { status })),
      } as unknown as Context;

      const res = errorHandler('string-error' as never, fakeCtx);
      const body = await (res as Response).json() as Record<string, unknown>;
      expect((res as Response).status).toBe(500);
      expect(body.error).toBe('Internal server error');
    });
  });
});
