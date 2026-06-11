/**
 * /api/clip ルートのテスト（fetch の SSRF 拒否・認証、YouTube クリップ）
 * Tests for clip routes: fetch SSRF rejection, auth, and YouTube clip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

vi.mock("../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

const {
  mockExtractYouTubeContent,
  mockResolveAiConfigForRequest,
  mockCalculateCost,
  mockRecordUsage,
} = vi.hoisted(() => ({
  mockExtractYouTubeContent: vi.fn(),
  mockResolveAiConfigForRequest: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockRecordUsage: vi.fn(),
}));

vi.mock("../../services/youtubeExtractor.js", () => ({
  extractYouTubeContent: (...args: unknown[]) => mockExtractYouTubeContent(...args),
}));

vi.mock("../../services/aiAccessHelpers.js", () => ({
  resolveAiConfigForRequest: (...args: unknown[]) => mockResolveAiConfigForRequest(...args),
}));

vi.mock("../../services/usageService.js", () => ({
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}));

import { Hono } from "hono";
import { errorHandler } from "../../middleware/errorHandler.js";
import clipRoutes from "../../routes/clip.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-clip-1";

function createClipApp() {
  const { db } = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/clip", clipRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

describe("POST /api/clip/fetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockResolveAiConfigForRequest.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for localhost (SSRF protection)", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "http://localhost/page" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/URL not allowed|only public http/i);
  });

  it("returns 400 for 127.0.0.1 (SSRF protection)", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "http://127.0.0.1:8080/" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/URL not allowed|only public http/i);
  });

  it("returns 200 with html when fetch succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html>hi</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "http://8.8.8.8/article" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { html?: string; url?: string; content_type?: string };
    expect(body.html).toBe("<html>hi</html>");
    expect(body.content_type).toBe("text/html");
  });

  it("returns 502 when fetch times out", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        }),
    ) as unknown as typeof fetch;

    const app = createClipApp();
    const res = await app.request("/api/clip/fetch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "http://8.8.8.8/slow" }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/timed out/i);
  });
});

describe("POST /api/clip/youtube", () => {
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  beforeEach(() => {
    mockExtractYouTubeContent.mockReset().mockResolvedValue({
      title: "Video title",
      thumbnailUrl: "https://img.youtube.com/thumb.jpg",
      tiptapJson: { type: "doc", content: [] },
      contentText: "transcript text",
      contentHash: "hash-vid",
      finalUrl: youtubeUrl,
      aiUsage: null,
    });
    mockResolveAiConfigForRequest.mockReset().mockResolvedValue(null);
    mockCalculateCost.mockReset().mockReturnValue(5);
    mockRecordUsage.mockReset().mockResolvedValue(undefined);
  });

  it("returns 401 without auth", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-YouTube URLs", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "https://example.com/not-youtube" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/not a valid YouTube/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns clip payload on success", async () => {
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: youtubeUrl }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; contentHash: string };
    expect(body.title).toBe("Video title");
    expect(body.contentHash).toBe("hash-vid");
    expect(mockExtractYouTubeContent).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "dQw4w9WgXcQ" }),
    );
    expect(mockResolveAiConfigForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID }),
    );
  });

  it("records usage when AI summary succeeds", async () => {
    mockResolveAiConfigForRequest.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      internalModelId: "gpt-4o-mini",
      apiKey: "sk-test",
      modelInfo: { inputCostUnits: 1, outputCostUnits: 2 },
    });
    mockExtractYouTubeContent.mockResolvedValue({
      title: "AI summary",
      thumbnailUrl: null,
      tiptapJson: {},
      contentText: "text",
      contentHash: "h2",
      finalUrl: youtubeUrl,
      aiUsage: { inputTokens: 100, outputTokens: 50 },
    });
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: youtubeUrl, provider: "openai", model: "gpt-4o-mini" }),
    });
    expect(res.status).toBe(200);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "gpt-4o-mini",
      "youtube_summary",
      { inputTokens: 100, outputTokens: 50 },
      5,
      "system",
      expect.anything(),
    );
  });

  it("returns 502 when extraction fails", async () => {
    mockExtractYouTubeContent.mockRejectedValue(new Error("YouTube API down"));
    const app = createClipApp();
    const res = await app.request("/api/clip/youtube", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: youtubeUrl }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/YouTube API down/i);
  });
});
