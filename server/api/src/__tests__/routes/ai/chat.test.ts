/**
 * /api/chat のテスト（モデル検証、usage 制御、SSE ストリーミング、エラー）。
 * Tests for /api/chat: model validation, usage gating, SSE streaming, errors.
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

// rateLimit はテストでは何もしないノーオプ。
// rateLimit becomes a no-op in tests so we can isolate the chat handler.
vi.mock("../../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

const {
  mockGetUserTier,
  mockValidateModelAccess,
  mockCheckUsage,
  mockCalculateCost,
  mockRecordUsage,
  mockCallProvider,
  mockStreamProvider,
  mockGetProviderApiKeyName,
} = vi.hoisted(() => ({
  mockGetUserTier: vi.fn(),
  mockValidateModelAccess: vi.fn(),
  mockCheckUsage: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockCallProvider: vi.fn(),
  mockStreamProvider: vi.fn(),
  mockGetProviderApiKeyName: vi.fn(),
}));

vi.mock("../../../services/subscriptionService.js", () => ({
  getUserTier: mockGetUserTier,
}));

vi.mock("../../../services/usageService.js", () => ({
  checkUsage: mockCheckUsage,
  validateModelAccess: mockValidateModelAccess,
  calculateCost: mockCalculateCost,
  recordUsage: mockRecordUsage,
}));

vi.mock("../../../services/aiProviders.js", () => ({
  callProvider: mockCallProvider,
  streamProvider: mockStreamProvider,
  getProviderApiKeyName: mockGetProviderApiKeyName,
}));

import { Hono } from "hono";
import chatRoutes from "../../../routes/ai/chat.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import { createMockDb } from "../../createMockDb.js";

const TEST_USER_ID = "user-chat-1";
const ORIGINAL_ENV = { ...process.env };

function createTestApp() {
  const { db } = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/chat", chatRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockGetUserTier.mockReset().mockResolvedValue("pro");
  mockValidateModelAccess.mockReset().mockResolvedValue({
    provider: "openai",
    apiModelId: "gpt-4o",
    inputCostUnits: 5,
    outputCostUnits: 15,
  });
  mockCheckUsage.mockReset().mockResolvedValue({
    allowed: true,
    usagePercent: 10,
    remaining: 13500,
    tier: "pro",
    budgetUnits: 15000,
    consumedUnits: 1500,
  });
  mockCalculateCost.mockReset().mockReturnValue(42);
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  mockCallProvider.mockReset();
  mockStreamProvider.mockReset();
  mockGetProviderApiKeyName.mockReset().mockReturnValue("OPENAI_API_KEY");
  process.env = { ...ORIGINAL_ENV };
});

// process.env と vi.spyOn(...) をテスト終了時に必ずクリーンアップする。
// テスト失敗時に inline mockRestore() がスキップされても spy が漏れないようにする。
// Always reset process.env and restore spies on test end so a failing test
// can't leak a console.error spy or env var into the next test.
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const validBody = {
  provider: "openai" as const,
  model: "gpt-4o",
  messages: [{ role: "user" as const, content: "hi" }],
};

// ── 入力検証 / Input validation ─────────────────────────────────────────────

describe("POST /api/chat — input validation", () => {
  it("returns 400 when provider is missing", async () => {
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "x" }] }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when messages array is empty", async () => {
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ provider: "openai", model: "gpt-4o", messages: [] }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
  });
});

// ── usage / API key 制御 / Gating ────────────────────────────────────────────

describe("POST /api/chat — usage and API key gating", () => {
  it("returns 429 when usage budget is exceeded", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCheckUsage.mockResolvedValueOnce({
      allowed: false,
      usagePercent: 105,
      remaining: 0,
      tier: "pro",
      budgetUnits: 15000,
      consumedUnits: 16000,
    });
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(429);
  });

  it("returns 503 when the provider's API key env var is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(503);
  });

  it("propagates 'Model not found or inactive' as a 500 by default", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockValidateModelAccess.mockRejectedValueOnce(new Error("Model not found or inactive"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(500);
  });

  it("maps a FORBIDDEN error from validateModelAccess to 403", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockValidateModelAccess.mockRejectedValueOnce(new Error("FORBIDDEN"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    // errorHandler の statusMap で FORBIDDEN → 403。
    // statusMap in errorHandler maps the literal "FORBIDDEN" message to 403.
    expect(res.status).toBe(403);
  });
});

// ── 非ストリーミング応答 / Non-streaming response ───────────────────────────

describe("POST /api/chat — non-streaming response", () => {
  it("returns content + usage and records the usage", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCallProvider.mockResolvedValue({
      content: "hello",
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    });
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      content: string;
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number; costUnits: number; usagePercent: number };
    };
    expect(body.content).toBe("hello");
    expect(body.finishReason).toBe("stop");
    expect(body.usage.inputTokens).toBe(10);
    expect(body.usage.outputTokens).toBe(5);
    expect(body.usage.costUnits).toBe(42);

    expect(mockRecordUsage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "gpt-4o",
      "chat",
      { inputTokens: 10, outputTokens: 5 },
      42,
      "system",
      expect.anything(),
    );
  });

  it("uses 'chat' as the default feature when options.feature is omitted", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCallProvider.mockResolvedValue({
      content: "ok",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    });
    const app = createTestApp();

    await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });

    expect(mockRecordUsage.mock.calls[0]?.[2]).toBe("chat");
  });

  it("respects custom options.feature", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockCallProvider.mockResolvedValue({
      content: "ok",
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    });
    const app = createTestApp();

    await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, options: { feature: "summarize" } }),
    });

    expect(mockRecordUsage.mock.calls[0]?.[2]).toBe("summarize");
  });
});

// ── ストリーミング応答 / SSE streaming ──────────────────────────────────────

describe("POST /api/chat — SSE streaming", () => {
  it("emits chunk and done payloads then records usage", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    async function* fakeStream() {
      yield { content: "Hel" };
      yield { content: "lo" };
      yield { done: true, finishReason: "stop" };
    }
    mockStreamProvider.mockReturnValue(fakeStream());
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, options: { stream: true } }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();

    // SSE フォーマット: 各 data: 行に JSON ペイロードが入る。
    // SSE format: each `data: ...` line carries one JSON payload.
    expect(text).toContain('data: {"content":"Hel"}');
    expect(text).toContain('data: {"content":"lo"}');
    expect(text).toMatch(/"done":true/);
    expect(text).toMatch(/"finishReason":"stop"/);

    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    const recordedFeature = mockRecordUsage.mock.calls[0]?.[2];
    expect(recordedFeature).toBe("chat");
  });

  it("emits an error payload when the provider stream throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test";

    async function* failingStream(): AsyncGenerator<{ content?: string }> {
      yield { content: "partial" };
      throw new Error("upstream 500");
    }
    mockStreamProvider.mockReturnValue(failingStream());
    const app = createTestApp();

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, options: { stream: true } }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/"error":"upstream 500"/);
    expect(text).toMatch(/"done":true/);
    // エラー時は recordUsage を呼ばない（done チャンクが来ないため）。
    // recordUsage is skipped on stream error since no `done` chunk arrives.
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});
