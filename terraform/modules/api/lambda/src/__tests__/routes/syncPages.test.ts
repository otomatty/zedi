import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TEST_USER_ID, createMockDb, jsonRequest, type MockDb,
} from '../helpers/setup';
import { createApp } from '../../app';

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
vi.mock('../../middleware/auth', () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('cognitoSub', 'test-cognito-sub');
    c.set('userEmail', 'test@example.com');
    await next();
  },
  authOptional: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('cognitoSub', 'test-cognito-sub');
    c.set('userEmail', 'test@example.com');
    await next();
  },
}));

describe('Sync Pages API — authenticated flows', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  // ── GET /api/sync/pages ─────────────────────────────────────────────────

  describe('GET /api/sync/pages', () => {
    it('returns pages, links, and ghost_links for the user', async () => {
      const now = new Date();
      const pageRows = [{
        id: 'p1', owner_id: TEST_USER_ID, title: 'Page 1',
        content_preview: null, thumbnail_url: null, source_url: null,
        source_page_id: null, is_deleted: false,
        created_at: now, updated_at: now,
      }];
      const linkRows = [{ sourceId: 'p1', targetId: 'p2', createdAt: now }];
      const ghostRows = [{ linkText: 'ghost', sourcePageId: 'p1', createdAt: now, originalTargetPageId: null, originalNoteId: null }];

      // Page query resolves via thenable (chain: select→from→where→$dynamic→orderBy)
      mockDb.then
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve(pageRows).then(r))
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve(linkRows).then(r))
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve(ghostRows).then(r));

      const res = await app.request('/api/sync/pages');

      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('pages');
      expect(body).toHaveProperty('links');
      expect(body).toHaveProperty('ghost_links');
      expect(body).toHaveProperty('server_time');
    });

    it('supports delta sync with since parameter', async () => {
      mockDb.then
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve([]).then(r))
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve([]).then(r))
        .mockImplementationOnce((r?: ((v: unknown) => unknown) | null) => Promise.resolve([]).then(r));

      const res = await app.request('/api/sync/pages?since=2025-01-01T00:00:00Z');

      expect(res.status).toBe(200);
      const body = await res.json() as { pages: unknown[] };
      expect(body.pages).toEqual([]);
    });
  });

  // ── POST /api/sync/pages ────────────────────────────────────────────────

  describe('POST /api/sync/pages', () => {
    it('creates new pages when they do not exist on server', async () => {
      // Page existence check: not found → insert
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{
          id: 'new-page', title: 'New', updated_at: '2025-06-01T00:00:00Z',
        }],
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { results: Array<{ id: string; action: string }> };
      expect(body.results).toContainEqual({ id: 'new-page', action: 'created' });
    });

    it('updates pages when client timestamp is newer (LWW)', async () => {
      mockDb.limit.mockResolvedValueOnce([{
        id: 'p1', updatedAt: new Date('2025-01-01'),
      }]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{
          id: 'p1', title: 'Updated', updated_at: '2025-06-01T00:00:00Z',
        }],
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { results: Array<{ id: string; action: string }> };
      expect(body.results).toContainEqual({ id: 'p1', action: 'updated' });
    });

    it('skips pages when server timestamp is newer (LWW)', async () => {
      mockDb.limit.mockResolvedValueOnce([{
        id: 'p1', updatedAt: new Date('2025-12-01'),
      }]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{
          id: 'p1', title: 'Old', updated_at: '2025-01-01T00:00:00Z',
        }],
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { results: Array<{ id: string; action: string }> };
      expect(body.results).toContainEqual({ id: 'p1', action: 'skipped' });
    });

    it('syncs links alongside pages', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{ id: 'p1', updated_at: '2025-06-01T00:00:00Z' }],
        links: [{ source_id: 'p1', target_id: 'p2' }],
      });

      expect(res.status).toBe(200);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('syncs ghost_links alongside pages', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{ id: 'p1', updated_at: '2025-06-01T00:00:00Z' }],
        ghost_links: [{ link_text: 'Ghost', source_page_id: 'p1' }],
      });

      expect(res.status).toBe(200);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('returns 400 when pages array is empty', async () => {
      const res = await jsonRequest(app, 'POST', '/api/sync/pages', { pages: [] });
      expect(res.status).toBe(400);
    });

    it('returns synced_at timestamp', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, 'POST', '/api/sync/pages', {
        pages: [{ id: 'p1', updated_at: '2025-06-01T00:00:00Z' }],
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { synced_at: string };
      expect(body.synced_at).toBeDefined();
      expect(new Date(body.synced_at).getTime()).not.toBeNaN();
    });
  });
});
