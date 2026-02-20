/**
 * Hono 統合 API テスト — ヘルスチェック + ルーティング
 *
 * Drizzle DB はモックし、Hono の testClient / app.request() で
 * HTTP レベルのルーティングとミドルウェアをテストする。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app';

// ── DB mock ─────────────────────────────────────────────────────────────────
vi.mock('../db/client', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
  })),
}));

// ── Env mock ────────────────────────────────────────────────────────────────
vi.mock('../env', () => ({
  getEnvConfig: vi.fn(() => ({
    AURORA_CLUSTER_ARN: 'arn:aws:rds:ap-northeast-1:123456789012:cluster:test',
    DB_CREDENTIALS_SECRET: 'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:test',
    AURORA_DATABASE_NAME: 'zedi',
    COGNITO_USER_POOL_ID: 'ap-northeast-1_testpool',
    COGNITO_REGION: 'ap-northeast-1',
    CORS_ORIGIN: '*',
    MEDIA_BUCKET: 'test-media-bucket',
    AI_SECRETS_ARN: 'arn:aws:secretsmanager:test:ai',
    RATE_LIMIT_TABLE: 'test-rate-limit',
    WEBHOOK_SECRET: 'test-webhook-secret',
    THUMBNAIL_SECRETS_ARN: 'arn:aws:secretsmanager:test:thumbnail',
    THUMBNAIL_BUCKET: 'test-thumbnail-bucket',
    THUMBNAIL_CLOUDFRONT_URL: 'https://thumbnails.example.com',
  })),
  resetEnvCache: vi.fn(),
}));

describe('Hono Unified API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  // ── Health check ──────────────────────────────────────────────────────────
  describe('GET /api/health', () => {
    it('should return 200 with status ok', async () => {
      const res = await app.request('/api/health', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('timestamp');
    });
  });

  // ── 404 fallback ──────────────────────────────────────────────────────────
  describe('Unknown routes', () => {
    it('should return 404 for unknown paths', async () => {
      const res = await app.request('/api/nonexistent', {
        method: 'GET',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error', 'Not found');
    });
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  describe('CORS', () => {
    it('should return CORS headers on OPTIONS', async () => {
      const res = await app.request('/api/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should include CORS headers in responses', async () => {
      const res = await app.request('/api/health', {
        method: 'GET',
        headers: {
          Origin: 'https://example.com',
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  // ── Auth required routes ──────────────────────────────────────────────────
  describe('Auth enforcement', () => {
    it('GET /api/users/:id should require auth (401 without token)', async () => {
      const mockEvent = {
        requestContext: {
          http: { method: 'GET', path: '/api/users/test-id' },
        },
      };

      const res = await app.request('/api/users/test-id', {
        method: 'GET',
      });

      // Auth middleware returns 401 when no JWT claims
      expect(res.status).toBe(401);
    });

    it('POST /api/pages should require auth', async () => {
      const res = await app.request('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      });

      expect(res.status).toBe(401);
    });

    it('GET /api/notes should require auth', async () => {
      const res = await app.request('/api/notes', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('GET /api/search should require auth', async () => {
      const res = await app.request('/api/search?q=test', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
    });

    it('POST /api/clip/fetch should require auth', async () => {
      const res = await app.request('/api/clip/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Route existence checks ────────────────────────────────────────────────
  describe('Route existence', () => {
    const protectedRoutes = [
      ['GET', '/api/ai/models'],
      ['POST', '/api/ai/chat'],
      ['GET', '/api/ai/usage'],
      ['GET', '/api/ai/subscription'],
      ['GET', '/api/thumbnail/image-search'],
      ['POST', '/api/thumbnail/image-generate'],
      ['POST', '/api/thumbnail/commit'],
      ['GET', '/api/sync/pages'],
      ['POST', '/api/sync/pages'],
      ['POST', '/api/media/upload'],
      ['POST', '/api/media/confirm'],
    ] as const;

    for (const [method, path] of protectedRoutes) {
      it(`${method} ${path} should exist (not 404)`, async () => {
        const res = await app.request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
        });

        // Should be 401 (auth required) not 404 (route not found)
        expect(res.status).not.toBe(404);
      });
    }
  });

  // ── Webhook route ─────────────────────────────────────────────────────────
  describe('POST /api/webhooks/lemonsqueezy', () => {
    it('should reject without signature', async () => {
      const res = await app.request('/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { event_name: 'test' } }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Health check — detailed ───────────────────────────────────────────────
  describe('GET /api/health — detailed', () => {
    it('200 と status: ok を返す', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('timestamp');
    });
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  describe('POST /api/users/upsert', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/users/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Pages ─────────────────────────────────────────────────────────────────
  describe('POST /api/pages', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Page' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/pages/:id/content', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/pages/test-id/content');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/pages/:id/content', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/pages/test-id/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: {} }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Notes ─────────────────────────────────────────────────────────────────
  describe('GET /api/notes', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/notes');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/notes', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Note' }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Sync Pages ────────────────────────────────────────────────────────────
  describe('GET /api/sync/pages', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/sync/pages');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/sync/pages', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/sync/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: [] }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────
  describe('GET /api/search', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/search?q=test');
      expect(res.status).toBe(401);
    });
  });

  // ── Media ─────────────────────────────────────────────────────────────────
  describe('POST /api/media/upload', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/media/confirm', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/media/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── AI ────────────────────────────────────────────────────────────────────
  describe('POST /api/ai/chat', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', model: 'gpt-4', messages: [] }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ai/usage', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/ai/usage');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ai/subscription', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/ai/subscription');
      expect(res.status).toBe(401);
    });
  });

  // ── Thumbnail ─────────────────────────────────────────────────────────────
  describe('GET /api/thumbnail/image-search', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/thumbnail/image-search?q=test');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/thumbnail/image-generate', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/thumbnail/image-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/thumbnail/commit', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/thumbnail/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Clip ──────────────────────────────────────────────────────────────────
  describe('POST /api/clip/fetch', () => {
    it('認証なしで 401 を返す', async () => {
      const res = await app.request('/api/clip/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Webhook — detailed ────────────────────────────────────────────────────
  describe('POST /api/webhooks/lemonsqueezy — detailed', () => {
    it('無効な署名で 401 を返す', async () => {
      const res = await app.request('/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'invalid-signature',
        },
        body: JSON.stringify({ meta: { event_name: 'subscription_created' } }),
      });
      expect(res.status).toBe(401);
    });

    it('署名ヘッダーなしで 401 を返す', async () => {
      const res = await app.request('/api/webhooks/lemonsqueezy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });
  });

  // ── Middleware: Error handler ──────────────────────────────────────────────
  describe('Error handler middleware', () => {
    it('未知のルートで 404 JSON レスポンスを返す', async () => {
      const res = await app.request('/api/unknown/path/here');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('error', 'Not found');
    });
  });
});
