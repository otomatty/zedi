import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createMockDb, TEST_USER_ID, type MockDb } from "../../helpers/setup";
import type { AppEnv, Database } from "../../../types";

const { mockValidateEvent, MockWebhookVerificationError } = vi.hoisted(() => {
  class _WebhookVerificationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "WebhookVerificationError";
    }
  }
  return {
    mockValidateEvent: vi.fn(),
    MockWebhookVerificationError: _WebhookVerificationError,
  };
});

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
    POLAR_SECRET_ARN: "arn:aws:secretsmanager:test:polar",
    COGNITO_USER_POOL_ID: "p",
    COGNITO_REGION: "us-east-1",
    AURORA_CLUSTER_ARN: "a",
    DB_CREDENTIALS_SECRET: "a",
    AURORA_DATABASE_NAME: "zedi",
  })),
  resetEnvCache: vi.fn(),
}));

vi.mock("../../../lib/secrets", () => ({
  getPolarSecrets: vi.fn().mockResolvedValue({
    POLAR_ACCESS_TOKEN: "test-polar-token",
    POLAR_WEBHOOK_SECRET: "whsec_test123",
  }),
}));

vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: mockValidateEvent,
  WebhookVerificationError: MockWebhookVerificationError,
}));

import polarWebhookRoutes from "../../../routes/webhooks/polar";

function postWebhook(app: Hono<AppEnv>, body: unknown = {}) {
  return app.request("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Polar Webhook", () => {
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
    app.route("/", polarWebhookRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: "Internal server error" }, 500);
    });
  });

  it("returns 403 for invalid webhook signature", async () => {
    mockValidateEvent.mockImplementationOnce(() => {
      throw new MockWebhookVerificationError("Invalid signature");
    });

    const res = await postWebhook(app, { type: "test" });

    expect(res.status).toBe(403);
  });

  it("upserts subscription as pro/active on subscription.created", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "subscription.created",
      data: {
        id: "sub_123",
        customer: { externalId: TEST_USER_ID },
        recurringInterval: "month",
      },
    });
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("updates status to canceled on subscription.canceled", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "subscription.canceled",
      data: { id: "sub_123", customer: { externalId: TEST_USER_ID } },
    });
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled" }));
  });

  it("updates to free/canceled on subscription.revoked", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "subscription.revoked",
      data: { id: "sub_123", customer: { externalId: TEST_USER_ID } },
    });
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "free", status: "canceled" }),
    );
  });

  it("updates status to past_due on subscription.past_due", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "subscription.past_due",
      data: { id: "sub_123", customer: { externalId: TEST_USER_ID } },
    });
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due" }));
  });

  it("returns warning when userId is not resolved", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "subscription.created",
      data: { id: "sub_123", customer: { externalId: "nonexistent-user" } },
    });
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; warning: string };
    expect(body.received).toBe(true);
    expect(body.warning).toBe("userId not resolved");
  });

  it("returns received without DB changes on order.paid", async () => {
    mockValidateEvent.mockReturnValueOnce({
      type: "order.paid",
      data: { id: "order_123", customer: { externalId: TEST_USER_ID } },
    });
    mockDb.limit.mockResolvedValueOnce([{ id: TEST_USER_ID }]);

    const res = await postWebhook(app);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
