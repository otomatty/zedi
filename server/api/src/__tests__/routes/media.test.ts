/**
 * POST /api/media/confirm の S3 キー所有者検証テスト。
 * GET /api/media/:id のプロキシ配信テスト。
 * Tests for S3 key ownership on confirm and streaming GET for media.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
}));

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
  class MockS3Client {
    send = (...args: unknown[]) => mockS3Send(...args);
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

beforeEach(() => {
  mockS3Send.mockReset();
});

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
    const traversalKey = `users/${TEST_USER_ID}/media/${MEDIA_ID}/../../../other-user/file.png`;
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

  it("accepts s3_key where filename contains '..' but does not traverse", async () => {
    const keyWithDots = `users/${TEST_USER_ID}/media/${MEDIA_ID}/a..b.png`;
    const app = createMediaApp([[{ id: MEDIA_ID, ownerId: TEST_USER_ID, s3Key: keyWithDots }]]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: keyWithDots,
        file_name: "a..b.png",
        content_type: "image/png",
      }),
    });

    expect(res.status).toBe(200);
  });

  it("rejects s3_key with mismatched media_id in prefix", async () => {
    const otherMediaId = "media-uuid-other";
    const mismatchedKey = `users/${TEST_USER_ID}/media/${otherMediaId}/photo.png`;
    const app = createMediaApp([]);

    const res = await app.request("/api/media/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        media_id: MEDIA_ID,
        s3_key: mismatchedKey,
        file_name: "photo.png",
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

describe("GET /api/media/:id — proxy stream (no redirect to storage)", () => {
  const s3Key = `users/${TEST_USER_ID}/media/${MEDIA_ID}/photo.png`;
  const mediaRow = {
    id: MEDIA_ID,
    ownerId: TEST_USER_ID,
    s3Key,
    fileName: "photo.png",
    contentType: "image/png",
    fileSize: null as number | null,
    pageId: null as string | null,
    createdAt: new Date(),
  };

  it("returns 200 and streams object bytes with Content-Type from DB row", async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("fake-bytes")]),
      ContentType: "image/jpeg",
    });
    const app = createMediaApp([[mediaRow]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe("fake-bytes");
  });

  it("returns 403 when media belongs to another user", async () => {
    const app = createMediaApp([[{ ...mediaRow, ownerId: ATTACKER_ID }]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(403);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("returns 404 when media row is missing", async () => {
    const app = createMediaApp([[]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(404);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("returns 401 without auth header", async () => {
    const app = createMediaApp([[mediaRow]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, { method: "GET" });

    expect(res.status).toBe(401);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("returns 404 when S3 reports NoSuchKey", async () => {
    mockS3Send.mockRejectedValueOnce({
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    const app = createMediaApp([[mediaRow]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Object not found");
  });

  it("returns 502 on unexpected S3 GetObject failure", async () => {
    mockS3Send.mockRejectedValueOnce(new Error("network down"));
    const app = createMediaApp([[mediaRow]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Failed to retrieve object");
  });
});
