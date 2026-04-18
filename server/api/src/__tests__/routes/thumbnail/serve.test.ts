/**
 * DELETE /api/thumbnail/serve/:id のストレージ→DB 削除順序テスト。
 * Tests for storage-first deletion ordering in DELETE /api/thumbnail/serve/:id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
}));

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

vi.mock("../../../lib/env.js", () => ({
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
  function MockGetObjectCommand() {
    /* stub */
  }
  function MockDeleteObjectCommand() {
    /* stub */
  }
  return {
    S3Client: MockS3Client,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  };
});

import { Hono } from "hono";
import serveRoutes from "../../../routes/thumbnail/serve.js";
import { createMockDb } from "../../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const ATTACKER_ID = "attacker-456";
const OBJECT_ID = "thumb-uuid-001";

function createServeApp(dbResults: unknown[]) {
  const mockDb = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", mockDb.db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/thumbnail/serve", serveRoutes);
  return { app, chains: mockDb.chains };
}

beforeEach(() => {
  mockS3Send.mockReset();
});

describe("DELETE /api/thumbnail/serve/:id — storage-first deletion order", () => {
  const s3Key = `thumbnails/${TEST_USER_ID}/${OBJECT_ID}.jpg`;
  const thumbRow = {
    id: OBJECT_ID,
    userId: TEST_USER_ID,
    s3Key,
    sizeBytes: 1024,
    createdAt: new Date(),
  };

  it("deletes storage object before DB row when both succeed", async () => {
    mockS3Send.mockResolvedValueOnce({});
    const { app } = createServeApp([[thumbRow], []]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it("keeps DB row and returns 502 when storage deletion fails with unexpected error", async () => {
    mockS3Send.mockRejectedValueOnce(new Error("network down"));
    const { app, chains } = createServeApp([[thumbRow]]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(502);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(0);
  });

  it("proceeds to delete DB row when storage reports NoSuchKey (idempotent)", async () => {
    mockS3Send.mockRejectedValueOnce({
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    const { app, chains } = createServeApp([[thumbRow], []]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(1);
  });

  it("keeps DB row and returns 502 for NoSuchBucket 404 (config failure, not idempotent)", async () => {
    mockS3Send.mockRejectedValueOnce({
      name: "NoSuchBucket",
      $metadata: { httpStatusCode: 404 },
    });
    const { app, chains } = createServeApp([[thumbRow]]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(502);
    const deleteCalls = chains.filter((c) => c.startMethod === "delete");
    expect(deleteCalls).toHaveLength(0);
  });

  it("returns 404 when DB row is missing or belongs to another user (no storage call)", async () => {
    const { app } = createServeApp([[]]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": ATTACKER_ID },
    });

    expect(res.status).toBe(404);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("returns 401 without auth header", async () => {
    const { app } = createServeApp([[thumbRow]]);

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
