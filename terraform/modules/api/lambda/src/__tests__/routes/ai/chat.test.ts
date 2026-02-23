import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createMockDb, TEST_USER_ID, jsonRequest, type MockDb } from "../../helpers/setup";
import type { AppEnv, Database } from "../../../types";

const {
  mockGetUserTier,
  mockValidateModelAccess,
  mockCheckUsage,
  mockCalculateCost,
  mockRecordUsage,
  mockCallProvider,
  mockGetProviderApiKeyName,
  mockGetAISecrets,
  mockGetRequired,
} = vi.hoisted(() => ({
  mockGetUserTier: vi.fn(),
  mockValidateModelAccess: vi.fn(),
  mockCheckUsage: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockCallProvider: vi.fn(),
  mockGetProviderApiKeyName: vi.fn(),
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

vi.mock("../../../services/subscriptionService", () => ({
  getUserTier: mockGetUserTier,
}));

vi.mock("../../../services/usageService", () => ({
  checkUsage: mockCheckUsage,
  validateModelAccess: mockValidateModelAccess,
  calculateCost: mockCalculateCost,
  recordUsage: mockRecordUsage,
}));

vi.mock("../../../services/aiProviders", () => ({
  callProvider: mockCallProvider,
  streamProvider: vi.fn(),
  getProviderApiKeyName: mockGetProviderApiKeyName,
}));

import chatRoutes from "../../../routes/ai/chat";

describe("AI Chat API", () => {
  let app: Hono<AppEnv>;
  let mockDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("db", mockDb as unknown as Database);
      await next();
    });
    app.route("/", chatRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: "Internal server error" }, 500);
    });

    mockGetUserTier.mockResolvedValue("free");
    mockValidateModelAccess.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      inputCostUnits: 15,
      outputCostUnits: 60,
    });
    mockCheckUsage.mockResolvedValue({
      allowed: true,
      budgetUnits: 10000,
      consumedUnits: 500,
      remaining: 9500,
      usagePercent: 5,
    });
    mockGetAISecrets.mockResolvedValue({ OPENAI_API_KEY: "sk-test" });
    mockGetRequired.mockReturnValue("sk-test");
    mockGetProviderApiKeyName.mockReturnValue("OPENAI_API_KEY");
    mockCalculateCost.mockReturnValue(100);
    mockRecordUsage.mockResolvedValue(undefined);
    mockCallProvider.mockResolvedValue({
      content: "Hello! How can I help you?",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it("returns 400 when provider, model, or messages are missing", async () => {
    const res = await jsonRequest(app, "POST", "/", {
      provider: "openai",
      model: "gpt-4o-mini",
    });

    expect(res.status).toBe(400);
  });

  it("returns 429 when monthly budget is exceeded", async () => {
    mockCheckUsage.mockResolvedValueOnce({
      allowed: false,
      budgetUnits: 10000,
      consumedUnits: 10001,
      remaining: 0,
      usagePercent: 100.01,
    });

    const res = await jsonRequest(app, "POST", "/", {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(res.status).toBe(429);
  });

  it("returns chat response with usage on success", async () => {
    const res = await jsonRequest(app, "POST", "/", {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number; costUnits: number; usagePercent: number };
    };
    expect(body.content).toBe("Hello! How can I help you?");
    expect(body.finishReason).toBe("stop");
    expect(body.usage.inputTokens).toBe(10);
    expect(body.usage.outputTokens).toBe(20);
    expect(body.usage.costUnits).toBe(100);
  });

  it("records usage after successful response", async () => {
    await jsonRequest(app, "POST", "/", {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(mockRecordUsage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "gpt-4o-mini",
      "chat",
      { inputTokens: 10, outputTokens: 20 },
      100,
      "system",
      expect.anything(),
    );
  });
});
