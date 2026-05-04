/**
 * `PUT /api/webhooks/github/ai-result/:id` — AI 解析結果コールバックのテスト
 * (Epic #616 Phase 2 / sub-issue #805)。
 *
 * Tests for the GitHub Actions AI analysis callback. Covers:
 * - 401: missing / malformed bearer token
 * - 403: bearer token rejected by GitHub-side validation
 * - 400: malformed body / invalid severity / malformed suspected files
 * - 404: unknown id / non-UUID id
 * - 200: successful update with AI analysis fields
 */
import { Hono } from "hono";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
  authOptional: async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

import githubAiCallbackRoutes from "../../../routes/webhooks/githubAiCallback.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import { createMockDb } from "../notes/setup.js";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

/**
 * テスト用アプリ。`dbResults` はハンドラ内のクエリ結果を順番に返す。
 * Build a test app whose mock DB returns `dbResults` in order.
 */
function createApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/webhooks/github/ai-result", githubAiCallbackRoutes);
  return { app, chains };
}

/**
 * `verifyInstallationToken` を一定の戻り値で差し替える。
 * Stub `verifyInstallationToken` to a fixed boolean for the duration of one
 * test. We bypass the GitHub round-trip so callback tests don't hit the
 * network.
 */
function stubVerifyInstallationToken(result: boolean | (() => Promise<boolean>)) {
  return vi.doMock("../../../lib/githubAppAuth.js", async () => {
    const actual = await vi.importActual<typeof import("../../../lib/githubAppAuth.js")>(
      "../../../lib/githubAppAuth.js",
    );
    return {
      ...actual,
      verifyInstallationToken: typeof result === "function" ? result : async () => result,
    };
  });
}

describe("PUT /api/webhooks/github/ai-result/:id", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_INSTALLATION_ID = "456";
    process.env.GITHUB_APP_PRIVATE_KEY = "stub";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { app } = createApp([]);
    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization header is not a Bearer token", async () => {
    const { app } = createApp([]);
    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Token abc" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when :id is not a valid UUID (no DB query issued)", async () => {
    const { app, chains } = createApp([]);
    const res = await app.request("/api/webhooks/github/ai-result/not-a-uuid", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_fake" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(404);
    expect(chains).toHaveLength(0);
  });

  it("returns 403 when verifyInstallationToken rejects the token", async () => {
    // verifyInstallationToken は外部 (GitHub) を叩くので必ずモックする。
    // Always stub verifyInstallationToken because it would otherwise hit
    // GitHub. Here we simulate "GitHub said no, this token isn't ours".
    vi.resetModules();
    await stubVerifyInstallationToken(false);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const { db } = createMockDb([]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_bad" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid JSON body", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const { db } = createMockDb([]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is JSON null", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const { db } = createMockDb([]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: "null",
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 and updates the row when payload is valid", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const updated = {
      id: VALID_UUID,
      sentryIssueId: "abc",
      severity: "high",
      aiSummary: "ヌルポインタ参照",
      aiSuspectedFiles: [{ path: "src/a.ts", line: 12 }],
      aiRootCause: "X が undefined",
      aiSuggestedFix: "guard 追加",
    };
    // updateAiAnalysis issues a single update chain that resolves to [row].
    const { db, chains } = createMockDb([[updated]]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: JSON.stringify({
        severity: "high",
        ai_summary: "ヌルポインタ参照",
        ai_suspected_files: [{ path: "src/a.ts", line: 12 }],
        ai_root_cause: "X が undefined",
        ai_suggested_fix: "guard 追加",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { id: string; severity: string } };
    expect(body.error.id).toBe(VALID_UUID);
    expect(body.error.severity).toBe("high");
    expect(chains.filter((c) => c.startMethod === "update")).toHaveLength(1);
  });

  it("returns 400 when severity is not a recognized value", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const { db } = createMockDb([]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: JSON.stringify({ severity: "garbage" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when ai_suspected_files is not an array of objects with .path", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const { db } = createMockDb([]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: JSON.stringify({ ai_suspected_files: [{ noPath: true }] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the row does not exist", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    // updateAiAnalysis returns null when the UPDATE returns no rows.
    const { db } = createMockDb([[]]);
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use("*", async (c, next) => {
      c.set("db", db as unknown as AppEnv["Variables"]["db"]);
      await next();
    });
    app.route("/api/webhooks/github/ai-result", routes);

    const res = await app.request(`/api/webhooks/github/ai-result/${VALID_UUID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_ok" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(404);
  });
});
