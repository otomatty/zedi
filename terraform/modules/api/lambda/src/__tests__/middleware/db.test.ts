import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));

vi.mock('../../db/client', () => ({ getDb: mockGetDb }));
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

import { dbMiddleware } from '../../middleware/db';

type AppEnv = {
  Bindings: { event: unknown };
  Variables: { db: unknown };
};

describe('dbMiddleware', () => {
  const fakeDatabaseClient = { fake: 'db' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(fakeDatabaseClient);
  });

  it('should set db on context by calling getDb()', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', dbMiddleware);
    app.get('/test', (c) => c.json({ db: c.get('db') }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.db).toEqual(fakeDatabaseClient);
    expect(mockGetDb).toHaveBeenCalledOnce();
  });

  it('should call next() after setting db', async () => {
    const nextCalled = vi.fn();
    const app = new Hono<AppEnv>();
    app.use('*', dbMiddleware);
    app.get('/test', (c) => {
      nextCalled();
      return c.json({ reached: true });
    });

    const res = await app.request('/test');

    expect(res.status).toBe(200);
    expect(nextCalled).toHaveBeenCalledOnce();
  });
});
