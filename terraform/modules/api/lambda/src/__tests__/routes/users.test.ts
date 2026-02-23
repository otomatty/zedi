import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TEST_USER_ID,
  TEST_COGNITO_SUB,
  TEST_USER_EMAIL,
  createMockDb,
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

describe("Users API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  // ── POST /api/users/upsert ──────────────────────────────────────────────
  // Uses JWT claims directly from API Gateway event (no authRequired)

  describe("POST /api/users/upsert", () => {
    const jwtEvent = {
      event: {
        requestContext: {
          authorizer: {
            jwt: {
              claims: { sub: TEST_COGNITO_SUB, email: TEST_USER_EMAIL },
            },
          },
        },
      },
    };

    it("creates a new user when none exists", async () => {
      const now = new Date();
      // Check by cognito_sub → not found
      mockDb.limit.mockResolvedValueOnce([]);
      // Check by email → not found
      mockDb.limit.mockResolvedValueOnce([]);
      // Insert → return new user
      mockDb.returning.mockResolvedValueOnce([
        {
          id: TEST_USER_ID,
          cognitoSub: TEST_COGNITO_SUB,
          email: TEST_USER_EMAIL,
          displayName: "Test User",
          avatarUrl: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const res = await app.request(
        "/api/users/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "Test User" }),
        },
        jwtEvent,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };
      expect(body.user.email).toBe(TEST_USER_EMAIL);
      expect(body.user.displayName).toBe("Test User");
    });

    it("updates existing user by cognito_sub", async () => {
      const existing = {
        id: TEST_USER_ID,
        cognitoSub: TEST_COGNITO_SUB,
        email: TEST_USER_EMAIL,
        displayName: "Old Name",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Found by cognito_sub
      mockDb.limit.mockResolvedValueOnce([existing]);
      // Update returns updated row
      mockDb.returning.mockResolvedValueOnce([
        {
          ...existing,
          displayName: "New Name",
          updatedAt: new Date(),
        },
      ]);

      const res = await app.request(
        "/api/users/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: "New Name" }),
        },
        jwtEvent,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };
      expect(body.user.displayName).toBe("New Name");
    });

    it("merges accounts by email when cognito_sub differs", async () => {
      const existingByEmail = {
        id: "other-id",
        cognitoSub: "old-sub",
        email: TEST_USER_EMAIL,
        displayName: "Existing",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Not found by cognito_sub
      mockDb.limit.mockResolvedValueOnce([]);
      // Found by email
      mockDb.limit.mockResolvedValueOnce([existingByEmail]);
      // Update cognito_sub
      mockDb.returning.mockResolvedValueOnce([
        {
          ...existingByEmail,
          cognitoSub: TEST_COGNITO_SUB,
        },
      ]);

      const res = await app.request(
        "/api/users/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        jwtEvent,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };
      expect(body.user.cognitoSub).toBe(TEST_COGNITO_SUB);
    });

    it("returns 401 without JWT claims", async () => {
      const res = await app.request("/api/users/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/users/:id ──────────────────────────────────────────────────

  describe("GET /api/users/:id", () => {
    it("returns user by ID", async () => {
      const user = {
        id: TEST_USER_ID,
        cognitoSub: TEST_COGNITO_SUB,
        email: TEST_USER_EMAIL,
        displayName: "Test",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.limit.mockResolvedValueOnce([user]);

      const res = await app.request(`/api/users/${TEST_USER_ID}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };
      expect(body.user.id).toBe(TEST_USER_ID);
    });

    it("returns 404 for non-existent user", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request("/api/users/missing");
      expect(res.status).toBe(404);
    });
  });
});
