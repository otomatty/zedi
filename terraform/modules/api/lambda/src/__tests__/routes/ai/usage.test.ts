import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb, type MockDb } from "../../helpers/setup";
import type { AppEnv, Database } from "../../../types";

const { mockGetUserTier, mockCheckUsage } = vi.hoisted(() => ({
  mockGetUserTier: vi.fn(),
  mockCheckUsage: vi.fn(),
}));

vi.mock("../../../middleware/auth", () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
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

vi.mock("../../../services/usageService", () => ({
  checkUsage: mockCheckUsage,
}));

import usageRoutes from "../../../routes/ai/usage";

describe("AI Usage API", () => {
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
    app.route("/", usageRoutes);
  });

  it("returns usage information for authenticated user", async () => {
    mockGetUserTier.mockResolvedValueOnce("free");
    mockCheckUsage.mockResolvedValueOnce({
      allowed: true,
      budgetUnits: 10000,
      consumedUnits: 3000,
      remaining: 7000,
      usagePercent: 30,
    });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tier: string;
      budget_units: number;
      consumed_units: number;
      remaining_units: number;
      usage_percent: number;
    };
    expect(body.tier).toBe("free");
    expect(body.budget_units).toBe(10000);
    expect(body.consumed_units).toBe(3000);
    expect(body.remaining_units).toBe(7000);
    expect(body.usage_percent).toBe(30);
  });
});
