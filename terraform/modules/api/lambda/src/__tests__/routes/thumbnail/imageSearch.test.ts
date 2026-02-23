import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

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

vi.mock("../../../env", () => ({
  getEnvConfig: vi.fn(() => ({
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
  })),
  resetEnvCache: vi.fn(),
}));

vi.mock("../../../lib/secrets", () => ({
  getThumbnailSecrets: mockGetThumbnailSecrets,
  getRequired: mockGetRequired,
}));

vi.mock("../../../services/imageSearch", () => ({
  searchImages: mockSearchImages,
}));

import imageSearchRoutes from "../../../routes/thumbnail/imageSearch";

describe("Thumbnail Image Search API", () => {
  let app: InstanceType<typeof Hono>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route("/", imageSearchRoutes);

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
});
