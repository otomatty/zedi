/**
 * /api/thumbnail/generate のテスト（Gemini 連携、入力検証、API キー未設定）。
 * Tests for /api/thumbnail/generate.
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

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));

vi.mock("../../../services/gemini.js", () => ({
  generateImageWithGemini: mockGenerate,
}));

import { Hono } from "hono";
import imageGenerateRoutes from "../../../routes/thumbnail/imageGenerate.js";
import { errorHandler } from "../../../middleware/errorHandler.js";

const ORIGINAL_ENV = { ...process.env };

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/api/thumbnail/generate", imageGenerateRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": "user-1",
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockGenerate.mockReset();
  process.env = { ...ORIGINAL_ENV };
  process.env.GOOGLE_AI_API_KEY = "test-key";
});

// process.env はワーカー間で共有されうるので、テスト終了後にも必ず元へ戻す。
// process.env can leak between test files via shared workers — restore it after every test.
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/thumbnail/generate", () => {
  it("returns 400 when prompt is missing", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 400 when prompt is whitespace only", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt: "   " }),
    });

    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 503 when GOOGLE_AI_API_KEY is not set", async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt: "a cat" }),
    });

    expect(res.status).toBe(503);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns 200 with imageUrl and mimeType from gemini service", async () => {
    mockGenerate.mockResolvedValue({
      imageUrl: "data:image/png;base64,xxx",
      mimeType: "image/png",
    });
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt: "  a sunset  ", aspectRatio: "1:1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageUrl: string; mimeType: string };
    expect(body).toEqual({ imageUrl: "data:image/png;base64,xxx", mimeType: "image/png" });
    expect(mockGenerate).toHaveBeenCalledWith("a sunset", "test-key", { aspectRatio: "1:1" });
  });

  it("defaults aspectRatio to 16:9 when omitted", async () => {
    mockGenerate.mockResolvedValue({ imageUrl: "data:...", mimeType: "image/png" });
    const app = createTestApp();

    await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ prompt: "x" }),
    });

    expect(mockGenerate).toHaveBeenCalledWith("x", "test-key", { aspectRatio: "16:9" });
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x" }),
    });

    expect(res.status).toBe(401);
  });
});
