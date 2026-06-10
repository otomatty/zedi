/**
 * Tests for /api/ingest (otomatty/zedi#595, graph #952, apply).
 * /api/ingest のルート統合テスト。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";
import { extractTitleKeywords } from "../../routes/ingest.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    c.set("userEmail", c.req.header("x-test-user-email") ?? "test@example.com");
    await next();
  },
}));

vi.mock("../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

const {
  mockGetUserTier,
  mockValidateModelAccessOrThrow,
  mockCheckUsage,
  mockCalculateCost,
  mockRecordUsage,
  mockExtractArticleFromUrl,
  mockCreateIngestLlmDriver,
  mockParseIngestPlanResponse,
  mockGetProviderApiKeyName,
  mockRecordActivity,
  mockGraphRunnerInvoke,
  mockGraphRunnerResume,
  mockResolveCheckpointerForRun,
  mockAssertComposeBackendReady,
} = vi.hoisted(() => ({
  mockGetUserTier: vi.fn(),
  mockValidateModelAccessOrThrow: vi.fn(),
  mockCheckUsage: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockExtractArticleFromUrl: vi.fn(),
  mockCreateIngestLlmDriver: vi.fn(),
  mockParseIngestPlanResponse: vi.fn(),
  mockGetProviderApiKeyName: vi.fn(),
  mockRecordActivity: vi.fn(),
  mockGraphRunnerInvoke: vi.fn(),
  mockGraphRunnerResume: vi.fn(),
  mockResolveCheckpointerForRun: vi.fn(),
  mockAssertComposeBackendReady: vi.fn(),
}));

vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: (...args: unknown[]) => mockGetUserTier(...args),
}));

vi.mock("../../services/aiAccessHelpers.js", () => ({
  validateModelAccessOrThrow: (...args: unknown[]) => mockValidateModelAccessOrThrow(...args),
}));

vi.mock("../../services/usageService.js", () => ({
  checkUsage: (...args: unknown[]) => mockCheckUsage(...args),
  calculateCost: (...args: unknown[]) => mockCalculateCost(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}));

vi.mock("../../services/articleExtractor.js", () => ({
  extractArticleFromUrl: (...args: unknown[]) => mockExtractArticleFromUrl(...args),
}));

vi.mock("../../services/ingestPlanner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/ingestPlanner.js")>();
  return {
    ...actual,
    createIngestLlmDriver: (...args: unknown[]) => mockCreateIngestLlmDriver(...args),
    parseIngestPlanResponse: (...args: unknown[]) => mockParseIngestPlanResponse(...args),
  };
});

vi.mock("../../services/aiProviders.js", () => ({
  callProvider: vi.fn(),
  getProviderApiKeyName: (...args: unknown[]) => mockGetProviderApiKeyName(...args),
}));

vi.mock("../../services/activityLogService.js", () => ({
  recordActivity: (...args: unknown[]) => mockRecordActivity(...args),
}));

vi.mock("../../agents/runner/graphRunner.js", () => ({
  GraphRunner: class {
    invoke = (...args: unknown[]) => mockGraphRunnerInvoke(...args);
    resume = (...args: unknown[]) => mockGraphRunnerResume(...args);
  },
}));

vi.mock("../../agents/core/checkpoint/index.js", () => ({
  resolveCheckpointerForRun: (...args: unknown[]) => mockResolveCheckpointerForRun(...args),
}));

vi.mock("../../agents/core/composeBackendValidation.js", () => ({
  assertComposeBackendReady: (...args: unknown[]) => mockAssertComposeBackendReady(...args),
}));

import { Hono } from "hono";
import { errorHandler } from "../../middleware/errorHandler.js";
import ingestRoutes from "../../routes/ingest.js";
import { createMockDb } from "../createMockDb.js";
import { IngestPlanParseError } from "../../services/ingestPlanner.js";

const TEST_USER_ID = "user-ingest-1";
const OTHER_USER_ID = "user-other-99";
const ORIGINAL_ENV = { ...process.env };

function authHeaders(userId = TEST_USER_ID): Record<string, string> {
  return {
    "x-test-user-id": userId,
    "x-test-user-email": "ingest@example.com",
    "Content-Type": "application/json",
  };
}

function createIngestApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/ingest", ingestRoutes);
  return app;
}

const sampleArticle = {
  title: "Ripgrep guide",
  finalUrl: "https://example.com/rg",
  contentText: "ripgrep is fast",
  thumbnailUrl: null,
  contentHash: "hash-abc",
};

const samplePlan = {
  action: "skip" as const,
  reason: "no merge needed",
};

beforeEach(() => {
  mockGetUserTier.mockReset().mockResolvedValue("pro");
  mockValidateModelAccessOrThrow.mockReset().mockResolvedValue({
    provider: "openai",
    apiModelId: "gpt-4o-mini",
    inputCostUnits: 1,
    outputCostUnits: 2,
  });
  mockCheckUsage.mockReset().mockResolvedValue({ allowed: true });
  mockCalculateCost.mockReset().mockReturnValue(10);
  mockRecordUsage.mockReset().mockResolvedValue(undefined);
  mockExtractArticleFromUrl.mockReset().mockResolvedValue(sampleArticle);
  mockCreateIngestLlmDriver.mockReset().mockReturnValue(async () => '{"action":"skip"}');
  mockParseIngestPlanResponse.mockReset().mockReturnValue(samplePlan);
  mockGetProviderApiKeyName.mockReset().mockReturnValue("OPENAI_API_KEY");
  mockRecordActivity.mockReset().mockResolvedValue(undefined);
  mockGraphRunnerInvoke.mockReset().mockResolvedValue({
    status: "completed",
    output: { ingestPlan: samplePlan },
  });
  mockGraphRunnerResume.mockReset().mockResolvedValue({
    status: "completed",
    output: { ingestPlan: samplePlan },
  });
  mockResolveCheckpointerForRun.mockReset().mockResolvedValue(false);
  mockAssertComposeBackendReady.mockReset().mockResolvedValue(undefined);
  process.env = { ...ORIGINAL_ENV, OPENAI_API_KEY: "sk-test" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("extractTitleKeywords", () => {
  it("splits title by whitespace and keeps tokens of length >= 2", () => {
    expect(extractTitleKeywords("ripgrep is fast")).toEqual(["ripgrep", "is", "fast"]);
  });

  it("drops the ' - site name' navigation suffix", () => {
    expect(extractTitleKeywords("ripgrep とは - Example.com")).toEqual(["ripgrep", "とは"]);
  });

  it("handles Japanese fullwidth bars '｜'", () => {
    expect(extractTitleKeywords("ripgrep 入門｜ブログ名")).toEqual(["ripgrep", "入門"]);
  });

  it("caps result at 5 tokens", () => {
    expect(extractTitleKeywords("ab cd ef gh ij kl mn op qr st uv")).toHaveLength(5);
  });

  it("returns empty array when nothing qualifies", () => {
    expect(extractTitleKeywords("")).toEqual([]);
    expect(extractTitleKeywords("a b c")).toEqual([]);
  });
});

describe("POST /api/ingest/plan", () => {
  const planBody = {
    url: "https://example.com/article",
    provider: "openai",
    model: "gpt-4o-mini",
  };

  it("returns 401 when session is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ provider: "openai", model: "gpt-4o-mini" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/url is required/i);
  });

  it("returns 400 when provider or model is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/provider and model/i);
  });

  it("returns 400 for unsupported provider", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...planBody, provider: "unknown" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/unsupported provider/i);
  });

  it("returns 429 when monthly budget is exceeded", async () => {
    mockCheckUsage.mockResolvedValue({ allowed: false });
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(429);
    expect(mockValidateModelAccessOrThrow).toHaveBeenCalledWith(
      "gpt-4o-mini",
      "pro",
      expect.anything(),
    );
  });

  it("returns 503 when API key is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 when article extraction fails", async () => {
    mockExtractArticleFromUrl.mockRejectedValue(new Error("URL not allowed"));
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(400);
    expect(mockExtractArticleFromUrl).toHaveBeenCalledWith({
      url: planBody.url,
      previewLength: 4000,
    });
  });

  it("returns 502 when LLM call fails", async () => {
    mockCreateIngestLlmDriver.mockReturnValue(async () => {
      throw new Error("upstream down");
    });
    const app = createIngestApp([{ rows: [] }, []]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(502);
  });

  it("returns 502 when plan parse fails", async () => {
    mockParseIngestPlanResponse.mockImplementation(() => {
      throw new IngestPlanParseError("bad json");
    });
    const app = createIngestApp([{ rows: [] }, []]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/invalid plan/i);
  });

  it("returns plan JSON on success and records usage", async () => {
    const candidateRow = {
      id: "page-cand-1",
      title: "Ripgrep",
      content_preview: "preview",
      content_text: "body text",
    };
    const app = createIngestApp([{ rows: [candidateRow] }, [{ contentText: "# My schema" }]]);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(planBody),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plan: { action: string };
      source: { url: string };
      candidates: unknown[];
    };
    expect(body.plan.action).toBe("skip");
    expect(body.source.url).toBe(sampleArticle.finalUrl);
    expect(body.candidates).toHaveLength(1);
    expect(mockRecordUsage).toHaveBeenCalledWith(
      TEST_USER_ID,
      "gpt-4o-mini",
      "ingest_plan",
      expect.objectContaining({ inputTokens: expect.any(Number) }),
      10,
      "system",
      expect.anything(),
    );
  });
});

describe("POST /api/ingest/graph/run", () => {
  const graphBody = {
    article: { title: "T", url: "https://ex.com", excerpt: "e" },
    candidates: [{ id: "c1", title: "C", excerpt: "x" }],
  };

  it("returns 401 without auth", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graphBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when article is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/run", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when article fields are incomplete", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/run", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ article: { title: "", url: "https://ex.com", excerpt: "" } }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when graph run fails with client error", async () => {
    mockGraphRunnerInvoke.mockResolvedValue({
      status: "failed",
      error: "invalid resume payload",
    });
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/run", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(graphBody),
    });
    expect(res.status).toBe(400);
    expect(mockAssertComposeBackendReady).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID }),
    );
  });

  it("returns graph output on success", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/run", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...graphBody, threadId: "thread-1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; threadId: string; plan: unknown };
    expect(body.status).toBe("completed");
    expect(body.threadId).toBe("thread-1");
    expect(body.plan).toEqual(samplePlan);
    expect(mockGraphRunnerInvoke).toHaveBeenCalled();
  });
});

describe("POST /api/ingest/graph/resume", () => {
  it("returns 400 when threadId is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ resume: { ok: true } }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when resume payload is missing", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ threadId: "t1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 when checkpointing is unavailable", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue(false);
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ threadId: "t1", resume: { approvedSourceIds: [] } }),
    });
    expect(res.status).toBe(503);
  });

  it("resumes graph when checkpointing is enabled", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue({});
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/graph/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ threadId: "t1", resume: { approvedSourceIds: ["s1"] } }),
    });
    expect(res.status).toBe(200);
    expect(mockGraphRunnerResume).toHaveBeenCalled();
  });
});

describe("POST /api/ingest/apply", () => {
  const applyBody = {
    kind: "url" as const,
    url: "https://example.com/src",
    title: "Source title",
    contentHash: "hash-1",
  };

  it("returns 401 without auth", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(applyBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when kind is invalid", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ kind: "invalid", title: "T" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when url is missing for kind=url", async () => {
    const app = createIngestApp([]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ kind: "url", title: "T" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when target page is not owned by caller", async () => {
    const app = createIngestApp([[]]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: authHeaders(OTHER_USER_ID),
      body: JSON.stringify({ ...applyBody, targetPageId: "page-other" }),
    });
    expect(res.status).toBe(403);
  });

  it("creates source and records activity on success", async () => {
    const newSourceId = "src-new-1";
    const targetPageId = "page-owned-1";
    const app = createIngestApp([[{ id: targetPageId }], [], [{ id: newSourceId }], undefined]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...applyBody, targetPageId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sourceId: string; targetPageId: string };
    expect(body.sourceId).toBe(newSourceId);
    expect(body.targetPageId).toBe(targetPageId);
    expect(mockRecordActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: TEST_USER_ID,
        kind: "clip_ingest",
        targetPageIds: [targetPageId],
      }),
    );
  });

  it("reuses existing source when content hash matches", async () => {
    const existingId = "src-existing";
    const app = createIngestApp([[{ id: existingId }]]);
    const res = await app.request("/api/ingest/apply", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(applyBody),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sourceId: string };
    expect(body.sourceId).toBe(existingId);
  });
});
