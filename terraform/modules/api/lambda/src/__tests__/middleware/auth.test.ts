import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { TEST_USER_ID, TEST_COGNITO_SUB, TEST_USER_EMAIL, createMockDb, type MockDb } from '../helpers/setup';

let mockDb: MockDb;

vi.mock('../../db/client', () => ({ getDb: vi.fn(() => mockDb) }));
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

import { authRequired, authOptional } from '../../middleware/auth';
import { dbMiddleware } from '../../middleware/db';

type AppEnv = {
  Bindings: { event: unknown };
  Variables: { userId: string; cognitoSub: string; userEmail?: string; db: unknown };
};

function createTestApp(middleware: unknown) {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });
  app.use('*', dbMiddleware);
  app.use('*', middleware as never);
  app.get('/test', (c) =>
    c.json({
      userId: c.get('userId') ?? null,
      cognitoSub: c.get('cognitoSub') ?? null,
      userEmail: c.get('userEmail') ?? null,
    }),
  );
  return app;
}

function withEvent(event: unknown) {
  return { event };
}

function jwtEvent(sub?: unknown) {
  return withEvent({
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
  });
}

describe('auth middleware', () => {
  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe('authRequired', () => {
    it('should throw 401 when no JWT claims present', async () => {
      const app = createTestApp(authRequired);

      const res = await app.request('/test', undefined, withEvent({}));

      expect(res.status).toBe(401);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Unauthorized');
    });

    it('should throw 401 when sub is not a string', async () => {
      const app = createTestApp(authRequired);

      const res = await app.request('/test', undefined, jwtEvent(12345));

      expect(res.status).toBe(401);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Unauthorized');
    });

    it('should throw 401 when user not found in DB', async () => {
      const app = createTestApp(authRequired);
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request('/test', undefined, jwtEvent(TEST_COGNITO_SUB));

      expect(res.status).toBe(401);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('User not found');
    });

    it('should set userId, cognitoSub, userEmail on context when valid', async () => {
      const app = createTestApp(authRequired);
      mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID, email: TEST_USER_EMAIL }]);

      const res = await app.request('/test', undefined, jwtEvent(TEST_COGNITO_SUB));

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.userId).toBe(TEST_USER_ID);
      expect(body.cognitoSub).toBe(TEST_COGNITO_SUB);
      expect(body.userEmail).toBe(TEST_USER_EMAIL);
    });
  });

  describe('authOptional', () => {
    it('should proceed without auth when no JWT claims', async () => {
      const app = createTestApp(authOptional);

      const res = await app.request('/test', undefined, withEvent({}));

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.userId).toBeNull();
      expect(body.cognitoSub).toBeNull();
    });

    it('should set user info when valid token present', async () => {
      const app = createTestApp(authOptional);
      mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID, email: TEST_USER_EMAIL }]);

      const res = await app.request('/test', undefined, jwtEvent(TEST_COGNITO_SUB));

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.userId).toBe(TEST_USER_ID);
      expect(body.cognitoSub).toBe(TEST_COGNITO_SUB);
      expect(body.userEmail).toBe(TEST_USER_EMAIL);
    });

    it('should proceed without setting user when user not found', async () => {
      const app = createTestApp(authOptional);
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request('/test', undefined, jwtEvent(TEST_COGNITO_SUB));

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.userId).toBeNull();
      expect(body.cognitoSub).toBeNull();
    });
  });
});
