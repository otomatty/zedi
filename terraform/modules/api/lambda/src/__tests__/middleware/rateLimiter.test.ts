import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { TEST_USER_ID, createMockDb, type MockDb } from '../helpers/setup';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: class { send = mockSend; },
    UpdateItemCommand: class { constructor(public input: unknown) {} },
  };
});

let mockEnvConfig = {
  CORS_ORIGIN: '*', MEDIA_BUCKET: 'b', AI_SECRETS_ARN: 'a',
  RATE_LIMIT_TABLE: 'test-rate-limit',
  THUMBNAIL_SECRETS_ARN: 'a', THUMBNAIL_BUCKET: 'b', THUMBNAIL_CLOUDFRONT_URL: 'https://t',
  ENVIRONMENT: 'test', POLAR_SECRET_ARN: 'a', COGNITO_USER_POOL_ID: 'p',
  COGNITO_REGION: 'us-east-1', AURORA_CLUSTER_ARN: 'a', DB_CREDENTIALS_SECRET: 'a',
  AURORA_DATABASE_NAME: 'zedi',
};

vi.mock('../../env', () => ({
  getEnvConfig: vi.fn(() => mockEnvConfig),
  resetEnvCache: vi.fn(),
}));

let mockDb: MockDb;
vi.mock('../../db/client', () => ({ getDb: vi.fn(() => mockDb) }));

import { rateLimiter } from '../../middleware/rateLimiter';
import { dbMiddleware } from '../../middleware/db';

type AppEnv = {
  Bindings: { event: unknown };
  Variables: { userId: string; cognitoSub: string; userEmail?: string; db: unknown };
};

function createTestApp(opts: { setUserId?: boolean } = {}) {
  const { setUserId = true } = opts;
  const app = new Hono<AppEnv>();
  app.use('*', dbMiddleware);
  if (setUserId) {
    app.use('*', async (c, next) => {
      c.set('userId', TEST_USER_ID);
      await next();
    });
  }
  app.use('*', rateLimiter);
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimiter middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockEnvConfig = { ...mockEnvConfig, RATE_LIMIT_TABLE: 'test-rate-limit' };
  });

  describe('authentication', () => {
    it('should throw 401 when userId is not set', async () => {
      const app = createTestApp({ setUserId: false });

      const res = await app.request('/test');

      expect(res.status).toBe(401);
    });
  });

  describe('table not configured', () => {
    it('should proceed without rate limiting when RATE_LIMIT_TABLE not configured', async () => {
      mockEnvConfig = { ...mockEnvConfig, RATE_LIMIT_TABLE: '' };
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('rate limit enforcement', () => {
    it('should allow request when count is within limit', async () => {
      mockSend.mockResolvedValueOnce({ Attributes: { count: { N: '5' } } });
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });

    it('should throw 429 when request count exceeds MAX_REQUESTS', async () => {
      mockSend.mockResolvedValueOnce({ Attributes: { count: { N: '121' } } });
      const app = createTestApp();

      const res = await app.request('/test');

      expect(res.status).toBe(429);
    });
  });

  describe('DynamoDB failure', () => {
    it('should proceed (fail-open) when DynamoDB call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB timeout'));
      const app = createTestApp();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });
  });
});
