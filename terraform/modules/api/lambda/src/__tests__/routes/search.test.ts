import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "../helpers/setup";
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

describe("Search API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  describe("GET /api/search", () => {
    it("returns empty results for empty query", async () => {
      const res = await app.request("/api/search");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: unknown[] };
      expect(body.results).toEqual([]);
    });

    it("returns empty results for whitespace-only query", async () => {
      const res = await app.request("/api/search?q=%20%20");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: unknown[] };
      expect(body.results).toEqual([]);
    });

    it("executes pg_bigm search for own pages (scope=own)", async () => {
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            id: "p1",
            title: "Test Page",
            content_preview: "Hello",
            updated_at: new Date().toISOString(),
            content_text: "Hello world",
          },
        ],
      });

      const res = await app.request("/api/search?q=test&scope=own");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: unknown[] };
      expect(body.results).toHaveLength(1);
    });

    it("executes pg_bigm search for shared pages (scope=shared)", async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const res = await app.request("/api/search?q=test&scope=shared");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: unknown[] };
      expect(body.results).toHaveLength(0);
    });

    it("defaults to scope=own when scope is not specified", async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const res = await app.request("/api/search?q=test");

      expect(res.status).toBe(200);
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });
});
