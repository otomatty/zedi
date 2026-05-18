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
  function MockHeadObjectCommand() {
    /* stub — /confirm での所有権確認用 Head。Ownership probe on POST /confirm. */
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
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
  // POST /confirm は常に HeadObject でプローブする。別レスポンスが必要なテストは mockResolvedValueOnce を使う。
  // POST /confirm always probes via HeadObject; tests needing other shapes use mockResolvedValueOnce.
  mockS3Send.mockResolvedValue({ ContentLength: 1024 });
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
    const payload = Buffer.from("fake-bytes");
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from([payload]),
      ContentType: "image/jpeg",
      ContentLength: payload.length,
    });
    const app = createMediaApp([[mediaRow]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Length")).toBe(String(payload.length));
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Vary")).toBe("Cookie");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.text()).toBe("fake-bytes");
  });

  it("uses S3 Content-Type when DB row has no content type and MIME is safe", async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("w")]),
      ContentType: "image/webp",
      ContentLength: 1,
    });
    const app = createMediaApp([[{ ...mediaRow, contentType: null }]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("returns inline image/avif when declared on the row", async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("x")]),
      ContentType: "application/octet-stream",
      ContentLength: 1,
    });
    const app = createMediaApp([[{ ...mediaRow, contentType: "image/avif", fileName: "x.avif" }]]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/avif");
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("forces application/octet-stream and attachment for disallowed types such as SVG", async () => {
    mockS3Send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from("<svg")]),
      ContentType: "image/svg+xml",
      ContentLength: 4,
    });
    const app = createMediaApp([
      [{ ...mediaRow, contentType: "image/svg+xml", fileName: "x.svg" }],
    ]);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "GET",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="x.svg"');
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

describe("DELETE /api/media/:id — DB-first deletion order", () => {
  // DB 削除を先に行うのは、SELECT と DELETE の間に所有権が変わる TOCTOU 窓で
  // 他人の行に紐づく S3 オブジェクトを消してしまわないため。DB 削除が 0 行だった
  // 場合は S3 を触らずに 403 を返す。
  //
  // The handler deletes the DB row first under an ownership-scoped WHERE. Only
  // after the DELETE returns a row do we touch S3, so a TOCTOU ownership change
  // cannot trigger an S3 delete on someone else's object.
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

  it("deletes DB row before storage object when both succeed", async () => {
    mockS3Send.mockResolvedValueOnce({});
    const { db, chains } = createMockDb([[mediaRow], [{ s3Key }]]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    // DB 削除が先に走り、その成功後に S3 を 1 回呼ぶ。
    // DB DELETE runs first; S3 send runs exactly once, after the DB succeeds.
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(1);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("returns 403 without touching storage when DB delete matches no rows (TOCTOU)", async () => {
    // SELECT 後に ownerId が変わった（並行削除・移管）シナリオ。
    // Ownership changed between SELECT and DELETE; S3 must not be touched.
    const { db, chains } = createMockDb([[mediaRow], []]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(403);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(1);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("still returns 200 when storage delete fails with unexpected error (orphan logged)", async () => {
    // DB 行は既に削除済みなので、S3 側の失敗は孤立オブジェクトとして残すのみ。
    // 呼び出し元から見れば削除は成功しているので 200 を返す。
    // The DB row is already gone; a post-DB S3 failure cannot be rolled back.
    // The orphan is logged for ops sweep, but the API still reports success.
    mockS3Send.mockRejectedValueOnce(new Error("network down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = createMockDb([[mediaRow], [{ s3Key }]]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("returns 200 when storage reports NoSuchKey (idempotent, DB already deleted)", async () => {
    mockS3Send.mockRejectedValueOnce({
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    const { db } = createMockDb([[mediaRow], [{ s3Key }]]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when media belongs to another user (no storage call, no DB delete)", async () => {
    const { chains, db } = createMockDb([[{ ...mediaRow, ownerId: ATTACKER_ID }]]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(403);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(0);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("returns 404 when media row is missing (no storage call, no DB delete)", async () => {
    const { chains, db } = createMockDb([[]]);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/media", mediaRoutes);

    const res = await app.request(`/api/media/${MEDIA_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(404);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(0);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
