/**
 * /api/thumbnail/search のテスト（クエリ検証、ページング、重複排除、エラー）。
 * Tests for /api/thumbnail/search (query validation, pagination, dedup, errors).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv, ImageSearchItem } from "../../../types/index.js";

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

const { mockSearchImages } = vi.hoisted(() => ({
  mockSearchImages: vi.fn(),
}));

vi.mock("../../../services/imageSearch.js", () => ({
  searchImages: mockSearchImages,
}));

import { Hono } from "hono";
import searchRoutes from "../../../routes/thumbnail/imageSearch.js";
import { errorHandler } from "../../../middleware/errorHandler.js";

const ORIGINAL_ENV = { ...process.env };

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/api/thumbnail/search", searchRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": "user-search-1",
    "Content-Type": "application/json",
  };
}

function makeItem(suffix: string): ImageSearchItem {
  return {
    id: `id-${suffix}`,
    previewUrl: `https://cdn/${suffix}-thumb.jpg`,
    imageUrl: `https://cdn/${suffix}.jpg`,
    alt: `alt ${suffix}`,
    sourceName: "cdn",
    sourceUrl: `https://cdn/${suffix}.html`,
  };
}

beforeEach(() => {
  mockSearchImages.mockReset();
  process.env = { ...ORIGINAL_ENV };
  process.env.GOOGLE_CUSTOM_SEARCH_API_KEY = "k";
  process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID = "cx";
});

describe("GET /api/thumbnail/search", () => {
  it("returns empty items when query is missing", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor?: string };
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeUndefined();
    expect(mockSearchImages).not.toHaveBeenCalled();
  });

  it("returns 503 when API key or engine id is missing", async () => {
    delete process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=cats", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(503);
  });

  it("returns 502 when service throws", async () => {
    mockSearchImages.mockRejectedValue(new Error("upstream"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=cats", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(502);
    consoleSpy.mockRestore();
  });

  it("deduplicates items by imageUrl", async () => {
    const a = makeItem("a");
    const b = makeItem("b");
    const c = { ...makeItem("c"), imageUrl: a.imageUrl }; // duplicate URL → dropped
    mockSearchImages.mockResolvedValue([a, b, c]);
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=cats&limit=10", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: ImageSearchItem[] };
    expect(body.items.map((i) => i.id)).toEqual(["id-a", "id-b"]);
  });

  it("clamps limit to [1, 30] and forwards to service", async () => {
    mockSearchImages.mockResolvedValue([]);
    const app = createTestApp();

    await app.request("/api/thumbnail/search?query=x&limit=999", { headers: authHeaders() });
    await app.request("/api/thumbnail/search?query=x&limit=0", { headers: authHeaders() });

    expect(mockSearchImages.mock.calls[0]?.[4]).toBe(30);
    expect(mockSearchImages.mock.calls[1]?.[4]).toBe(1);
  });

  it("clamps cursor to >= 1", async () => {
    mockSearchImages.mockResolvedValue([]);
    const app = createTestApp();

    await app.request("/api/thumbnail/search?query=x&cursor=0", { headers: authHeaders() });
    await app.request("/api/thumbnail/search?query=x&cursor=-5", { headers: authHeaders() });

    expect(mockSearchImages.mock.calls[0]?.[3]).toBe(1);
    expect(mockSearchImages.mock.calls[1]?.[3]).toBe(1);
  });

  it("emits a nextCursor when results are present and pagination cap not reached", async () => {
    mockSearchImages.mockResolvedValue([makeItem("a")]);
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=x&limit=10&cursor=2", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor?: string };
    expect(body.nextCursor).toBe("3");
  });

  it("omits nextCursor once cursor*limit reaches 100", async () => {
    mockSearchImages.mockResolvedValue([makeItem("a")]);
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=x&limit=10&cursor=10", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor?: string };
    expect(body.nextCursor).toBeUndefined();
  });

  it("omits nextCursor when no items match", async () => {
    mockSearchImages.mockResolvedValue([]);
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=x&cursor=1", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor?: string };
    expect(body.nextCursor).toBeUndefined();
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/thumbnail/search?query=x", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
