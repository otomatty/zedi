/**
 * DELETE /api/thumbnail/serve/:id のレスポンス契約テスト。
 * Tests for the DELETE /api/thumbnail/serve/:id response contract.
 *
 * ルートは共通 GC サービス `deleteThumbnailObject` に委譲し、結果を
 * HTTP ステータスへマッピングする (200 / 404 / 409)。GC の内部順序や TOCTOU は
 * サービス側のテスト (`__tests__/services/thumbnailGcService.test.ts`) で検証する。
 *
 * The route delegates to the shared `deleteThumbnailObject` service and
 * maps the discriminated outcome to HTTP status codes (200/404/409).
 * Internal ordering and TOCTOU semantics live in the service-level tests
 * (`__tests__/services/thumbnailGcService.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

const { mockS3Send, mockDeleteThumbnailObject } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
  mockDeleteThumbnailObject: vi.fn(),
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

vi.mock("../../../services/thumbnailGcService.js", () => ({
  deleteThumbnailObject: (...args: unknown[]) => mockDeleteThumbnailObject(...args),
}));

import { Hono } from "hono";
import serveRoutes from "../../../routes/thumbnail/serve.js";
import { createMockDb } from "../../createMockDb.js";

const TEST_USER_ID = "user-test-123";
const ATTACKER_ID = "attacker-456";
const OBJECT_ID = "thumb-uuid-001";

function createServeApp() {
  const mockDb = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", mockDb.db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/thumbnail/serve", serveRoutes);
  return { app };
}

beforeEach(() => {
  mockS3Send.mockReset();
  mockDeleteThumbnailObject.mockReset();
});

describe("DELETE /api/thumbnail/serve/:id", () => {
  it("returns 200 when the GC service deletes the object", async () => {
    mockDeleteThumbnailObject.mockResolvedValueOnce("deleted");
    const { app } = createServeApp();

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(200);
    expect(mockDeleteThumbnailObject).toHaveBeenCalledTimes(1);
    // ルートは objectId と呼び出し元 userId をそのまま渡す。
    // The route forwards the path objectId and the caller's userId.
    expect(mockDeleteThumbnailObject.mock.calls[0]?.[0]).toBe(OBJECT_ID);
    expect(mockDeleteThumbnailObject.mock.calls[0]?.[1]).toBe(TEST_USER_ID);
  });

  it("returns 404 when the GC service reports 'not_found'", async () => {
    mockDeleteThumbnailObject.mockResolvedValueOnce("not_found");
    const { app } = createServeApp();

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": ATTACKER_ID },
    });

    expect(res.status).toBe(404);
  });

  it("returns 409 when a live page still references the thumbnail (issue #820 guard)", async () => {
    // ライブページが `thumbnail_object_id` で参照しているサムネイルは
    // クライアント rollback の誤発火から守るため削除を拒否する。
    //
    // Refuses to delete a thumbnail that a non-deleted page row still
    // references — protects against phantom client rollbacks that would
    // otherwise strip a live page of its thumbnail.
    mockDeleteThumbnailObject.mockResolvedValueOnce("referenced");
    const { app } = createServeApp();

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
      headers: { "x-test-user-id": TEST_USER_ID },
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/referenced/i);
  });

  it("returns 401 without auth header and never calls the GC service", async () => {
    const { app } = createServeApp();

    const res = await app.request(`/api/thumbnail/serve/${OBJECT_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(401);
    expect(mockDeleteThumbnailObject).not.toHaveBeenCalled();
  });
});
