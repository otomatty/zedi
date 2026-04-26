/**
 * /api/thumbnail/commit のテスト（入力検証、外部 API、保存先未設定、容量超過）。
 * Tests for /api/thumbnail/commit (input validation, S3 wiring, errors).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

vi.mock("../../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

const { mockCommitImage } = vi.hoisted(() => ({
  mockCommitImage: vi.fn(),
}));

vi.mock("../../../services/commitService.js", () => ({
  commitImage: mockCommitImage,
}));

import { Hono } from "hono";
import commitRoutes from "../../../routes/thumbnail/commit.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import { createMockDb } from "../../createMockDb.js";

const TEST_USER_ID = "user-thumb-1";
const ORIGINAL_ENV = { ...process.env };

function createTestApp() {
  const { db } = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/thumbnail/commit", commitRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockCommitImage.mockReset();
  process.env = { ...ORIGINAL_ENV };
  process.env.STORAGE_BUCKET_NAME = "test-bucket";
});

// process.env はワーカー間で共有されうるので、テスト終了後にも必ず元へ戻す。
// process.env can leak between test files via shared workers — restore it after every test.
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/thumbnail/commit", () => {
  it("returns 400 when sourceUrl is missing", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(mockCommitImage).not.toHaveBeenCalled();
  });

  it("returns 400 when sourceUrl is whitespace only", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceUrl: "   " }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 503 when STORAGE_BUCKET_NAME is not configured", async () => {
    delete process.env.STORAGE_BUCKET_NAME;
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceUrl: "https://example.com/img.png" }),
    });

    expect(res.status).toBe(503);
    expect(mockCommitImage).not.toHaveBeenCalled();
  });

  it("returns 200 with imageUrl + provider when commitService succeeds", async () => {
    mockCommitImage.mockResolvedValue({ imageUrl: "https://cdn.example/abc.png" });
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        sourceUrl: "  https://example.com/img.png  ",
        fallbackUrl: "  https://example.com/fallback.png  ",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageUrl: string; provider: string };
    expect(body).toEqual({ imageUrl: "https://cdn.example/abc.png", provider: "s3" });
    // trim 後の値をサービスに渡す。
    // The handler trims both sourceUrl and fallbackUrl before forwarding.
    expect(mockCommitImage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "https://example.com/img.png",
      "https://example.com/fallback.png",
      expect.anything(),
    );
  });

  it("returns 413 when commitService throws STORAGE_QUOTA_EXCEEDED", async () => {
    mockCommitImage.mockRejectedValue(new Error("STORAGE_QUOTA_EXCEEDED"));
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceUrl: "https://example.com/img.png" }),
    });

    expect(res.status).toBe(413);
  });

  it("returns 502 when commitService throws an unrelated error", async () => {
    mockCommitImage.mockRejectedValue(new Error("S3 down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceUrl: "https://example.com/img.png" }),
    });

    expect(res.status).toBe(502);
    consoleSpy.mockRestore();
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: "https://example.com/x.png" }),
    });

    expect(res.status).toBe(401);
  });
});
