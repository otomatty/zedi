/**
 * POST /api/media/confirm の S3 キー所有者検証テスト。
 * Tests for S3 key ownership validation on POST /api/media/confirm.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => {
    const envMap: Record<string, string> = {
      STORAGE_ENDPOINT: "http://localhost:9000",
      STORAGE_ACCESS_KEY: "test-key",
      STORAGE_SECRET_KEY: "test-secret",
      STORAGE_BUCKET_NAME: "test-bucket",
    };
    return envMap[key] ?? "";
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  function MockS3Client() {
    /* stub */
  }
  function MockPutObjectCommand() {
    /* stub */
  }
  function MockGetObjectCommand() {
    /* stub */
  }
  function MockDeleteObjectCommand() {
    /* stub */
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://mock-presigned-url.example.com"),
}));

import { Hono } from "hono";
import mediaRoutes from "../../routes/media.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const ATTACKER_ID = "attacker-456";
const MEDIA_ID = "media-uuid-001";

function authHeaders(userId = TEST_USER_ID) {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

function createMediaApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/media", mediaRoutes);
  return app;
}

describe("POST /api/media/confirm — S3 key ownership validation", () => {
  it("accepts s3_key matching the authenticated user's prefix", async () => {
    const s3Key = `users/${TEST_USER_ID}/media/${MEDIA_ID}/photo.png`;
    const app = createMediaApp([[{ id: MEDIA_ID, ownerId: TEST_USER_ID, s3Key }]]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: s3Key,
        file_name: "photo.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(200);
  });

  it("rejects s3_key belonging to another user (IDOR)", async () => {
    const victimKey = `users/${TEST_USER_ID}/media/${MEDIA_ID}/secret.png`;
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(ATTACKER_ID),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: victimKey,
        file_name: "secret.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(403);
  });

  it("rejects s3_key with arbitrary path not matching user prefix", async () => {
    const arbitraryKey = "some/random/path/file.png";
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: arbitraryKey,
        file_name: "file.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(403);
  });

  it("rejects s3_key with path traversal attempt", async () => {
    const traversalKey = `users/${TEST_USER_ID}/media/../../other-user/file.png`;
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: traversalKey,
        file_name: "file.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 when media_id or s3_key is missing", async () => {
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ file_name: "photo.png" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth header", async () => {
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: `users/${TEST_USER_ID}/media/${MEDIA_ID}/photo.png`,
        file_name: "photo.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(401);
  });
});
