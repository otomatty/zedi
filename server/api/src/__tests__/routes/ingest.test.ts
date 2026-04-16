/**
 * Tests for /api/ingest (otomatty/zedi#595).
 * /api/ingest のテスト。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractTitleKeywords } from "../../routes/ingest.js";

type AuthSession = Awaited<ReturnType<typeof import("../../auth.js").auth.api.getSession>>;

vi.mock("../../db/client.js", () => ({
  getDb: vi.fn(() => ({})),
}));

const mockSessionUser = {
  id: "user-1",
  email: "u@e.com",
  name: "",
  image: null as string | null,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: null as string | null,
  status: "active" as string | null,
};

vi.mock("../../auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// Middleware DB lookup should find an active user.
vi.mock("../../middleware/db.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../middleware/db.js")>("../../middleware/db.js");
  return actual;
});

import { auth } from "../../auth.js";
import { Hono } from "hono";
import { errorHandler } from "../../middleware/errorHandler.js";
import ingestRoutes from "../../routes/ingest.js";
import type { AppEnv } from "../../types/index.js";

function createIngestApp(dbMock: unknown) {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  // Inject a pre-set db into the context for each request.
  app.use("*", async (c, next) => {
    c.set("db", dbMock as never);
    await next();
  });
  app.route("/api/ingest", ingestRoutes);
  return app;
}

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
    // 2 文字以上のトークンが 5 件を超えた場合に 5 件に制限されることを確認する。
    expect(extractTitleKeywords("ab cd ef gh ij kl mn op qr st uv")).toHaveLength(5);
  });

  it("returns empty array when nothing qualifies", () => {
    expect(extractTitleKeywords("")).toEqual([]);
    // Single-char tokens are filtered out
    expect(extractTitleKeywords("a b c")).toEqual([]);
  });
});

describe("POST /api/ingest/plan", () => {
  // status lookup の 1 件目結果を返す最小モック
  const activeUserDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ status: "active" }],
        }),
      }),
    }),
  };

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: mockSessionUser,
    } as unknown as AuthSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    const app = createIngestApp(activeUserDb);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when url is missing", async () => {
    const app = createIngestApp(activeUserDb);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai", model: "gpt-4o-mini" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/url is required/i);
  });

  it("returns 400 when provider or model is missing", async () => {
    const app = createIngestApp(activeUserDb);
    const res = await app.request("/api/ingest/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/provider and model/i);
  });
});
