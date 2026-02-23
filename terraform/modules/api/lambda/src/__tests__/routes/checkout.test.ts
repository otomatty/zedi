import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { TEST_USER_ID, jsonRequest } from '../helpers/setup';

const { mockCheckoutsCreate, mockCustomerSessionsCreate } = vi.hoisted(() => ({
  mockCheckoutsCreate: vi.fn(),
  mockCustomerSessionsCreate: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('cognitoSub', 'test-cognito-sub');
    c.set('userEmail', 'test@example.com');
    await next();
  },
}));

vi.mock('../../env', () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: '*', MEDIA_BUCKET: 'b', AI_SECRETS_ARN: 'a', RATE_LIMIT_TABLE: 'r',
    THUMBNAIL_SECRETS_ARN: 'a', THUMBNAIL_BUCKET: 'b', THUMBNAIL_CLOUDFRONT_URL: 'https://t',
    ENVIRONMENT: 'test', POLAR_SECRET_ARN: 'arn:aws:secretsmanager:test:polar',
    COGNITO_USER_POOL_ID: 'p', COGNITO_REGION: 'us-east-1',
    AURORA_CLUSTER_ARN: 'a', DB_CREDENTIALS_SECRET: 'a', AURORA_DATABASE_NAME: 'zedi',
  })),
  resetEnvCache: vi.fn(),
}));

vi.mock('../../lib/secrets', () => ({
  getPolarSecrets: vi.fn().mockResolvedValue({
    POLAR_ACCESS_TOKEN: 'test-polar-token',
    POLAR_WEBHOOK_SECRET: 'test-webhook-secret',
  }),
}));

vi.mock('@polar-sh/sdk', () => ({
  Polar: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.checkouts = { create: mockCheckoutsCreate };
    this.customerSessions = { create: mockCustomerSessionsCreate };
  }),
}));

import checkoutRoutes from '../../routes/checkout';

describe('Checkout API', () => {
  let app: InstanceType<typeof Hono>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/', checkoutRoutes);
  });

  describe('POST /checkout', () => {
    it('returns checkout URL on success', async () => {
      mockCheckoutsCreate.mockResolvedValueOnce({
        url: 'https://checkout.polar.sh/session-123',
      });

      const res = await jsonRequest(app, 'POST', '/checkout', {
        productId: 'prod_123',
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { url: string };
      expect(body.url).toBe('https://checkout.polar.sh/session-123');
      expect(mockCheckoutsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          products: ['prod_123'],
          externalCustomerId: TEST_USER_ID,
        }),
      );
    });

    it('returns 400 when productId is missing', async () => {
      const res = await jsonRequest(app, 'POST', '/checkout', {});

      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('productId');
    });
  });

  describe('POST /customer-portal', () => {
    it('returns portal URL on success', async () => {
      mockCustomerSessionsCreate.mockResolvedValueOnce({
        customerPortalUrl: 'https://portal.polar.sh/session-abc',
      });

      const res = await jsonRequest(app, 'POST', '/customer-portal', {});

      expect(res.status).toBe(200);
      const body = await res.json() as { url: string };
      expect(body.url).toBe('https://portal.polar.sh/session-abc');
      expect(mockCustomerSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ externalCustomerId: TEST_USER_ID }),
      );
    });
  });
});
