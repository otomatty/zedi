import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMockDb, TEST_USER_ID, jsonRequest, type MockDb } from '../../helpers/setup';

const { mockCommitImage } = vi.hoisted(() => ({
  mockCommitImage: vi.fn(),
}));

vi.mock('../../../middleware/auth', () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('cognitoSub', 'test-cognito-sub');
    c.set('userEmail', 'test@example.com');
    await next();
  },
}));

vi.mock('../../../middleware/rateLimiter', () => ({
  rateLimiter: async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

vi.mock('../../../env', () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: '*', MEDIA_BUCKET: 'b', AI_SECRETS_ARN: 'a', RATE_LIMIT_TABLE: 'r',
    THUMBNAIL_SECRETS_ARN: 'a', THUMBNAIL_BUCKET: 'test-thumbnail-bucket',
    THUMBNAIL_CLOUDFRONT_URL: 'https://thumbnails.test.example.com', ENVIRONMENT: 'test',
    POLAR_SECRET_ARN: 'a', COGNITO_USER_POOL_ID: 'p', COGNITO_REGION: 'us-east-1',
    AURORA_CLUSTER_ARN: 'a', DB_CREDENTIALS_SECRET: 'a', AURORA_DATABASE_NAME: 'zedi',
  })),
  resetEnvCache: vi.fn(),
}));

vi.mock('../../../services/commitService', () => ({
  commitImage: mockCommitImage,
}));

import commitRoutes from '../../../routes/thumbnail/commit';

describe('Thumbnail Commit API', () => {
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
    app.route('/', commitRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: 'Internal server error' }, 500);
    });
  });

  it('returns 400 when sourceUrl is missing', async () => {
    const res = await jsonRequest(app, 'POST', '/', {});

    expect(res.status).toBe(400);
  });

  it('returns imageUrl and provider on success', async () => {
    mockCommitImage.mockResolvedValueOnce({
      imageUrl: 'https://thumbnails.test.example.com/abc123.webp',
    });

    const res = await jsonRequest(app, 'POST', '/', {
      sourceUrl: 'https://example.com/image.jpg',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { imageUrl: string; provider: string };
    expect(body.imageUrl).toBe('https://thumbnails.test.example.com/abc123.webp');
    expect(body.provider).toBe('s3');
    expect(mockCommitImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      'https://example.com/image.jpg',
      undefined,
      expect.anything(),
      expect.anything(),
    );
  });
});
