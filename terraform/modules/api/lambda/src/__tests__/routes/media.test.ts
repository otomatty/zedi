import { describe, it, expect, vi, beforeEach } from "vitest";
import { TEST_USER_ID, createMockDb, jsonRequest, type MockDb } from "../helpers/setup";
import { createApp } from "../../app";

let mockDb: MockDb;

vi.mock("../../db/client", () => ({ getDb: vi.fn(() => mockDb) }));
vi.mock("../../env", () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: "*",
    MEDIA_BUCKET: "test-media-bucket",
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
vi.mock("@aws-sdk/client-s3", () => {
  function MockS3Client() {}
  return {
    S3Client: MockS3Client,
    PutObjectCommand: class PutObjectCommand {
      constructor(public input: unknown) {}
    },
    GetObjectCommand: class GetObjectCommand {
      constructor(public input: unknown) {}
    },
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/signed-url"),
}));

describe("Media API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  describe("POST /api/media/upload", () => {
    it("returns presigned URL for valid upload request", async () => {
      const res = await jsonRequest(app, "POST", "/api/media/upload", {
        file_name: "image.png",
        content_type: "image/png",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { upload_url: string; media_id: string; s3_key: string };
      expect(body.upload_url).toBe("https://s3.example.com/signed-url");
      expect(body.media_id).toBeDefined();
      expect(body.s3_key).toContain(TEST_USER_ID);
    });

    it("returns 400 when file_name is missing", async () => {
      const res = await jsonRequest(app, "POST", "/api/media/upload", {
        content_type: "image/png",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when content_type is missing", async () => {
      const res = await jsonRequest(app, "POST", "/api/media/upload", {
        file_name: "image.png",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/media/confirm", () => {
    it("confirms upload and stores media record", async () => {
      const now = new Date();
      mockDb.returning.mockResolvedValueOnce([
        {
          id: "media-1",
          ownerId: TEST_USER_ID,
          s3Key: "key",
          fileName: "image.png",
          contentType: "image/png",
          fileSize: 1024,
          pageId: null,
          createdAt: now,
        },
      ]);

      const res = await jsonRequest(app, "POST", "/api/media/confirm", {
        media_id: "media-1",
        s3_key: "key",
        file_name: "image.png",
        content_type: "image/png",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { media: Record<string, unknown> };
      expect(body.media.id).toBe("media-1");
    });

    it("returns 400 when media_id is missing", async () => {
      const res = await jsonRequest(app, "POST", "/api/media/confirm", {
        s3_key: "key",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/media/:id", () => {
    it("redirects to signed S3 URL", async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: "media-1",
          s3Key: "users/test/media/1/image.png",
        },
      ]);

      const res = await app.request("/api/media/media-1", { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://s3.example.com/signed-url");
    });

    it("returns 404 for non-existent media", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request("/api/media/missing");
      expect(res.status).toBe(404);
    });
  });
});
