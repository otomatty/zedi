import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { jsonRequest } from "../../helpers/setup";

const { mockGenerateImage, mockGetAISecrets, mockGetRequired } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockGetAISecrets: vi.fn(),
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
    AI_SECRETS_ARN: "arn:aws:secretsmanager:test:ai",
    RATE_LIMIT_TABLE: "r",
    THUMBNAIL_SECRETS_ARN: "a",
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
  getAISecrets: mockGetAISecrets,
  getRequired: mockGetRequired,
}));

vi.mock("../../../services/gemini", () => ({
  generateImageWithGemini: mockGenerateImage,
}));

import imageGenerateRoutes from "../../../routes/thumbnail/imageGenerate";

describe("Thumbnail Image Generate API", () => {
  let app: InstanceType<typeof Hono>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route("/", imageGenerateRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    mockGetAISecrets.mockResolvedValue({ GOOGLE_AI_API_KEY: "test-google-key" });
    mockGetRequired.mockReturnValue("test-google-key");
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await jsonRequest(app, "POST", "/", {});

    expect(res.status).toBe(400);
  });

  it("returns imageUrl and mimeType on success", async () => {
    mockGenerateImage.mockResolvedValueOnce({
      imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSU...",
      mimeType: "image/png",
    });

    const res = await jsonRequest(app, "POST", "/", {
      prompt: "A beautiful sunset over mountains",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageUrl: string; mimeType: string };
    expect(body.imageUrl).toContain("data:image/png");
    expect(body.mimeType).toBe("image/png");
    expect(mockGenerateImage).toHaveBeenCalledWith(
      "A beautiful sunset over mountains",
      "test-google-key",
      expect.objectContaining({ aspectRatio: "16:9" }),
    );
  });
});
