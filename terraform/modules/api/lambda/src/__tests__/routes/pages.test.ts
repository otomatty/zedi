import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TEST_USER_ID,
  OTHER_USER_ID,
  createMockDb,
  jsonRequest,
  type MockDb,
} from "../helpers/setup";
import { createApp } from "../../app";

let mockDb: MockDb;

vi.mock("../../db/client", () => ({ getDb: vi.fn(() => mockDb) }));
vi.mock("../../env", () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: "*",
    MEDIA_BUCKET: "b",
    AI_SECRETS_ARN: "a",
    RATE_LIMIT_TABLE: "r",
    THUMBNAIL_SECRETS_ARN: "a",
    THUMBNAIL_BUCKET: "b",
    THUMBNAIL_CLOUDFRONT_URL: "https://t",
    ENVIRONMENT: "test",
    POLAR_SECRET_ARN: "a",
    COGNITO_USER_POOL_ID: "p",
    COGNITO_REGION: "us-east-1",
    AURORA_CLUSTER_ARN: "a",
    DB_CREDENTIALS_SECRET: "a",
    AURORA_DATABASE_NAME: "zedi",
  })),
  resetEnvCache: vi.fn(),
}));
vi.mock("../../middleware/auth", () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
  authOptional: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
}));

describe("Pages API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  // ── POST /api/pages ─────────────────────────────────────────────────────

  describe("POST /api/pages", () => {
    it("creates a new page and returns 201", async () => {
      const now = new Date();
      mockDb.returning.mockResolvedValueOnce([
        {
          id: "page-1",
          ownerId: TEST_USER_ID,
          sourcePageId: null,
          title: "Test Page",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        },
      ]);

      const res = await jsonRequest(app, "POST", "/api/pages", { title: "Test Page" });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe("page-1");
      expect(body.owner_id).toBe(TEST_USER_ID);
      expect(body.title).toBe("Test Page");
      expect(body.is_deleted).toBe(false);
    });

    it("creates a page with source_url for web clips", async () => {
      const now = new Date();
      mockDb.returning.mockResolvedValueOnce([
        {
          id: "clip-1",
          ownerId: TEST_USER_ID,
          sourcePageId: null,
          title: "Clipped",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: "https://example.com",
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        },
      ]);

      const res = await jsonRequest(app, "POST", "/api/pages", {
        title: "Clipped",
        source_url: "https://example.com",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.source_url).toBe("https://example.com");
    });
  });

  // ── GET /api/pages/:id/content ──────────────────────────────────────────

  describe("GET /api/pages/:id/content", () => {
    it("returns Y.Doc content as base64", async () => {
      const ydoc = Buffer.from("test-ydoc-state");
      mockDb.limit
        .mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }])
        .mockResolvedValueOnce([
          {
            pageId: "p1",
            ydocState: ydoc,
            version: 3,
            contentText: "hello",
            updatedAt: new Date("2025-01-01"),
          },
        ]);

      const res = await app.request("/api/pages/p1/content");

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.content).toBe(ydoc.toString("base64"));
      expect(body.version).toBe(3);
      expect(body.content_text).toBe("hello");
    });

    it("returns null content when no content row exists", async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }])
        .mockResolvedValueOnce([]);

      const res = await app.request("/api/pages/p1/content");

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.content).toBeNull();
      expect(body.version).toBe(0);
    });

    it("returns 404 for non-existent page", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request("/api/pages/missing/content");
      expect(res.status).toBe(404);
    });

    it("returns 403 for another user's page", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: OTHER_USER_ID }]);

      const res = await app.request("/api/pages/p1/content");
      expect(res.status).toBe(403);
    });
  });

  // ── PUT /api/pages/:id/content ──────────────────────────────────────────

  describe("PUT /api/pages/:id/content", () => {
    const b64Content = Buffer.from("ydoc").toString("base64");

    it("updates content without optimistic locking (upsert)", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }]);
      mockDb.returning.mockResolvedValueOnce([{ version: 2 }]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.version).toBe(2);
    });

    it("succeeds with optimistic lock when versions match", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }]);
      mockDb.returning.mockResolvedValueOnce([{ version: 4 }]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
        expected_version: 3,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.version).toBe(4);
    });

    it("returns 409 on optimistic lock version conflict", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }]);
      // Optimistic lock update returns empty (version mismatch)
      mockDb.returning.mockResolvedValueOnce([]);
      // Current version query
      mockDb.limit.mockResolvedValueOnce([{ version: 5 }]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
        expected_version: 3,
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toContain("Version conflict");
    });

    it("returns 400 when content is missing", async () => {
      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {});
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent page", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for another user's page", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: OTHER_USER_ID }]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
      });
      expect(res.status).toBe(403);
    });

    it("updates title alongside content", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }]);
      mockDb.returning.mockResolvedValueOnce([{ version: 2 }]);

      const res = await jsonRequest(app, "PUT", "/api/pages/p1/content", {
        content: b64Content,
        title: "Updated Title",
      });

      expect(res.status).toBe(200);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ── DELETE /api/pages/:id ───────────────────────────────────────────────

  describe("DELETE /api/pages/:id", () => {
    it("logically deletes a page", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: TEST_USER_ID }]);

      const res = await app.request("/api/pages/p1", { method: "DELETE" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBe("p1");
      expect(body.deleted).toBe(true);
    });

    it("returns 404 for non-existent page", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request("/api/pages/missing", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("returns 403 for another user's page", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "p1", ownerId: OTHER_USER_ID }]);

      const res = await app.request("/api/pages/p1", { method: "DELETE" });
      expect(res.status).toBe(403);
    });
  });
});
