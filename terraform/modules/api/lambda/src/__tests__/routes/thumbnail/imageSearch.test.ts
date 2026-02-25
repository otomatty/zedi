import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const { mockSearchImages, mockGetThumbnailSecrets, mockGetRequired } = vi.hoisted(() => ({
  mockSearchImages: vi.fn(),
  mockGetThumbnailSecrets: vi.fn(),
  mockGetRequired: vi.fn(),
}));

vi.mock("../../../middleware/auth", () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
}));

vi.mock("../../../middleware/rateLimiter", () => ({
  rateLimiter: async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

const defaultEnv = {
  CORS_ORIGIN: "*",
  MEDIA_BUCKET: "b",
  AI_SECRETS_ARN: "a",
  RATE_LIMIT_TABLE: "r",
  THUMBNAIL_SECRETS_ARN: "arn:aws:secretsmanager:test:thumbnail",
  THUMBNAIL_BUCKET: "b",
  THUMBNAIL_CLOUDFRONT_URL: "https://t",
  ENVIRONMENT: "test",
  POLAR_SECRET_ARN: "a",
  COGNITO_USER_POOL_ID: "p",
  COGNITO_REGION: "us-east-1",
  AURORA_CLUSTER_ARN: "a",
  DB_CREDENTIALS_SECRET: "a",
  AURORA_DATABASE_NAME: "zedi",
};

vi.mock("../../../env", () => ({
  getEnvConfig: vi.fn(() => defaultEnv),
  resetEnvCache: vi.fn(),
}));

vi.mock("../../../lib/secrets", () => ({
  getThumbnailSecrets: mockGetThumbnailSecrets,
  getRequired: mockGetRequired,
}));

vi.mock("../../../services/imageSearch", () => ({
  searchImages: mockSearchImages,
}));

import { getEnvConfig } from "../../../env";
import imageSearchRoutes from "../../../routes/thumbnail/imageSearch";

describe("Thumbnail Image Search API", () => {
  let app: InstanceType<typeof Hono>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnvConfig).mockReturnValue(defaultEnv);

    app = new Hono();
    app.route("/", imageSearchRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    mockGetThumbnailSecrets.mockResolvedValue({
      GOOGLE_CUSTOM_SEARCH_API_KEY: "test-api-key",
      GOOGLE_CUSTOM_SEARCH_ENGINE_ID: "test-engine-id",
    });
    mockGetRequired.mockImplementation((_secrets: unknown, key: string) => `test-${key}`);
  });

  it("returns empty items for empty query", async () => {
    const res = await app.request("/?query=");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: undefined };
    expect(body.items).toHaveLength(0);
    expect(body.nextCursor).toBeUndefined();
    expect(mockSearchImages).not.toHaveBeenCalled();
  });

  it("returns search results with deduplication", async () => {
    mockSearchImages.mockResolvedValueOnce([
      {
        id: "1",
        previewUrl: "https://img.example.com/1_thumb.jpg",
        imageUrl: "https://img.example.com/1.jpg",
        alt: "Image 1",
        sourceName: "Example",
        sourceUrl: "https://example.com/1",
      },
      {
        id: "2",
        previewUrl: "https://img.example.com/1_thumb.jpg",
        imageUrl: "https://img.example.com/1.jpg",
        alt: "Image 1 Dup",
        sourceName: "Example",
        sourceUrl: "https://example.com/1-dup",
      },
      {
        id: "3",
        previewUrl: "https://img.example.com/2_thumb.jpg",
        imageUrl: "https://img.example.com/2.jpg",
        alt: "Image 2",
        sourceName: "Example",
        sourceUrl: "https://example.com/2",
      },
    ]);

    const res = await app.request("/?query=nature&limit=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ imageUrl: string }>; nextCursor: string };
    expect(body.items).toHaveLength(2);
    expect(body.items[0].imageUrl).toBe("https://img.example.com/1.jpg");
    expect(body.items[1].imageUrl).toBe("https://img.example.com/2.jpg");
  });

  it("returns nextCursor when more results available", async () => {
    mockSearchImages.mockResolvedValueOnce([
      {
        id: "1",
        previewUrl: "https://img.example.com/1_thumb.jpg",
        imageUrl: "https://img.example.com/1.jpg",
        alt: "Image 1",
        sourceName: "Example",
        sourceUrl: "https://example.com/1",
      },
    ]);

    const res = await app.request("/?query=cats&limit=1&cursor=1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor: string | undefined };
    expect(body.nextCursor).toBe("2");
  });

  it("returns 503 when THUMBNAIL_SECRETS_ARN is not set", async () => {
    vi.mocked(getEnvConfig).mockReturnValue({
      ...defaultEnv,
      THUMBNAIL_SECRETS_ARN: "",
    });

    const res = await app.request("/?query=test");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error ?? body.message).toContain("API キーが未設定");
    expect(mockSearchImages).not.toHaveBeenCalled();
  });

  it("returns 503 when getThumbnailSecrets throws", async () => {
    mockGetThumbnailSecrets.mockRejectedValueOnce(new Error("secrets fetch failed"));

    const res = await app.request("/?query=test");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error ?? body.message).toContain("API キーの取得に失敗");
    expect(mockSearchImages).not.toHaveBeenCalled();
  });

  it("returns 502 when searchImages throws", async () => {
    mockSearchImages.mockRejectedValueOnce(new Error("Google API error"));

    const res = await app.request("/?query=test");

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error ?? body.message).toContain("画像検索に失敗しました");
  });
});
