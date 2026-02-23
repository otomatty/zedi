import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb, TEST_USER_ID, type MockDb } from "../../helpers/setup";
import type { AppEnv, Database } from "../../../types";

const { mockAuthOptional, mockGetUserTier } = vi.hoisted(() => ({
  mockAuthOptional: vi.fn(),
  mockGetUserTier: vi.fn(),
}));

vi.mock("../../../middleware/auth", () => ({
  authOptional: mockAuthOptional,
}));

vi.mock("../../../env", () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: "*",
    MEDIA_BUCKET: "b",
    AI_SECRETS_ARN: "a",
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

vi.mock("../../../services/subscriptionService", () => ({
  getUserTier: mockGetUserTier,
}));

import modelsRoutes from "../../../routes/ai/models";

const MOCK_MODELS = [
  {
    id: "m1",
    provider: "openai",
    model_id: "gpt-4o-mini",
    display_name: "GPT-4o Mini",
    tier_required: "free",
    is_active: true,
    sort_order: 1,
  },
  {
    id: "m2",
    provider: "openai",
    model_id: "gpt-4o",
    display_name: "GPT-4o",
    tier_required: "pro",
    is_active: true,
    sort_order: 2,
  },
];

describe("AI Models API", () => {
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
    app.route("/", modelsRoutes);

    mockAuthOptional.mockImplementation(
      async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
        c.set("userId", TEST_USER_ID);
        c.set("cognitoSub", "test-cognito-sub");
        c.set("userEmail", "test@example.com");
        await next();
      },
    );

    mockDb.then.mockImplementation((r?: ((v: unknown) => unknown) | null) =>
      Promise.resolve(MOCK_MODELS).then(r),
    );
  });

  it("returns models with availability for free user", async () => {
    mockGetUserTier.mockResolvedValueOnce("free");

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      models: Array<{ model_id: string; available: boolean }>;
      tier: string;
    };
    expect(body.tier).toBe("free");
    expect(body.models).toHaveLength(2);

    const mini = body.models.find((m) => m.model_id === "gpt-4o-mini");
    const full = body.models.find((m) => m.model_id === "gpt-4o");
    expect(mini?.available).toBe(true);
    expect(full?.available).toBe(false);
  });

  it("returns models with all available for pro user", async () => {
    mockGetUserTier.mockResolvedValueOnce("pro");

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      models: Array<{ available: boolean }>;
      tier: string;
    };
    expect(body.tier).toBe("pro");
    expect(body.models.every((m) => m.available)).toBe(true);
  });

  it("works without authentication", async () => {
    mockAuthOptional.mockImplementationOnce(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tier: string; models: Array<{ available: boolean }> };
    expect(body.tier).toBe("free");
    expect(mockGetUserTier).not.toHaveBeenCalled();
  });
});
