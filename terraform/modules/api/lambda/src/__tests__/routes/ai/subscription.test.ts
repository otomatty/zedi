import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMockDb, TEST_USER_ID, type MockDb } from '../../helpers/setup';

const { mockGetUserTier, mockGetSubscription, mockCheckUsage } = vi.hoisted(() => ({
  mockGetUserTier: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockCheckUsage: vi.fn(),
}));

vi.mock('../../../middleware/auth', () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('cognitoSub', 'test-cognito-sub');
    c.set('userEmail', 'test@example.com');
    await next();
  },
}));

vi.mock('../../../env', () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: '*', MEDIA_BUCKET: 'b', AI_SECRETS_ARN: 'a', RATE_LIMIT_TABLE: 'r',
    THUMBNAIL_SECRETS_ARN: 'a', THUMBNAIL_BUCKET: 'b', THUMBNAIL_CLOUDFRONT_URL: 'https://t',
    ENVIRONMENT: 'test', POLAR_SECRET_ARN: 'a', COGNITO_USER_POOL_ID: 'p',
    COGNITO_REGION: 'us-east-1', AURORA_CLUSTER_ARN: 'a', DB_CREDENTIALS_SECRET: 'a',
    AURORA_DATABASE_NAME: 'zedi',
  })),
  resetEnvCache: vi.fn(),
}));

vi.mock('../../../services/subscriptionService', () => ({
  getUserTier: mockGetUserTier,
  getSubscription: mockGetSubscription,
}));

vi.mock('../../../services/usageService', () => ({
  checkUsage: mockCheckUsage,
}));

import subscriptionRoutes from '../../../routes/ai/subscription';

describe('AI Subscription API', () => {
  let app: InstanceType<typeof Hono>;
  let mockDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db', mockDb as any);
      await next();
    });
    app.route('/', subscriptionRoutes);
  });

  it('returns subscription info with usage', async () => {
    mockGetUserTier.mockResolvedValueOnce('pro');
    mockGetSubscription.mockResolvedValueOnce({
      userId: TEST_USER_ID,
      plan: 'pro',
      status: 'active',
      externalId: 'sub_123',
      billingInterval: 'monthly',
    });
    mockCheckUsage.mockResolvedValueOnce({
      allowed: true,
      budgetUnits: 100000,
      consumedUnits: 2500,
      remaining: 97500,
      usagePercent: 2.5,
    });

    const res = await app.request('/');

    expect(res.status).toBe(200);
    const body = await res.json() as {
      plan: string;
      subscription: { plan: string; status: string };
      usage: { budget_units: number; consumed_units: number; remaining_units: number; usage_percent: number };
    };
    expect(body.plan).toBe('pro');
    expect(body.subscription.status).toBe('active');
    expect(body.usage.budget_units).toBe(100000);
    expect(body.usage.consumed_units).toBe(2500);
    expect(body.usage.remaining_units).toBe(97500);
    expect(body.usage.usage_percent).toBe(2.5);
  });
});
