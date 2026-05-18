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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

  it("returns 503 when verifyInstallationToken throws (transient GitHub outage)", async () => {
    // GitHub 側の 5xx / ネットワーク障害は 403 ではなく 503 にマップされ、
    // workflow 側でリトライ可能であることを示す。
    // GitHub-side outages must surface as 503 (retryable) rather than 403,
    // so a transient outage doesn't permanently drop a valid AI result.
    vi.resetModules();
    await vi.doMock("../../../lib/githubAppAuth.js", async () => {
      const actual = await vi.importActual<typeof import("../../../lib/githubAppAuth.js")>(
        "../../../lib/githubAppAuth.js",
      );
      return {
        ...actual,
        verifyInstallationToken: async () => {
          throw new actual.GitHubInstallationVerificationError("upstream 503");
        },
      };
    });
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
      headers: { "Content-Type": "application/json", Authorization: "Bearer ghs_xx" },
      body: JSON.stringify({ severity: "high" }),
    });
    expect(res.status).toBe(503);
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
    const pre = {
      id: VALID_UUID,
      sentryIssueId: "abc",
      severity: "unknown",
      title: "TypeError",
    };
    const updated = {
      id: VALID_UUID,
      sentryIssueId: "abc",
      severity: "high",
      title: "TypeError",
      aiSummary: "ヌルポインタ参照",
      aiSuspectedFiles: [{ path: "src/a.ts", line: 12 }],
      aiRootCause: "X が undefined",
      aiSuggestedFix: "guard 追加",
    };
    // The route now does a pre-read (`getApiErrorById`) before the UPDATE so
    // it can compare pre/post severity for the Phase 3 notifier. Mock both
    // chains: select then update.
    const { db, chains } = createMockDb([[pre], [updated]]);
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
    const body = (await res.json()) as { data: { id: string; severity: string } };
    expect(body.data.id).toBe(VALID_UUID);
    expect(body.data.severity).toBe("high");
    expect(chains.filter((c) => c.startMethod === "update")).toHaveLength(1);
  });

  it("returns 400 when severity is not a recognized value", async () => {
    vi.resetModules();
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    // Pre-read returns the existing row; updateAiAnalysis then throws
    // ApiErrorAiAnalysisValidationError on the bad severity → 400.
    const pre = { id: VALID_UUID, sentryIssueId: "abc", severity: "unknown", title: "x" };
    const { db } = createMockDb([[pre]]);
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
    const pre = { id: VALID_UUID, sentryIssueId: "abc", severity: "unknown", title: "x" };
    const { db } = createMockDb([[pre]]);
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
    // The pre-read short-circuits to 404 when the row is missing, so the
    // route never issues the UPDATE.
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

  it("notifies once when severity transitions from unknown into high (Phase 3 / #809)", async () => {
    // severity が `unknown` から `high` へ初めて昇格したケース。1 回だけ
    // notifier に渡すことを担保する。
    //
    // First-sight escalation from `unknown` → `high` must invoke the
    // notifier exactly once with the post-update row's fields.
    vi.resetModules();
    const notifySpy = vi.fn().mockResolvedValue({ email: { sent: true, id: "e1" } });
    await vi.doMock("../../../services/notifier.js", () => ({
      notifyApiErrorAlert: notifySpy,
    }));
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const pre = {
      id: VALID_UUID,
      sentryIssueId: "sentry-xyz",
      severity: "unknown",
      title: "TypeError",
    };
    const updated = { ...pre, severity: "high" };
    const { db } = createMockDb([[pre], [updated]]);
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
    expect(res.status).toBe(200);
    // fire-and-forget の microtask が消化されるのを待つ。
    // Drain any pending microtasks queued by the fire-and-forget call.
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith({
      apiErrorId: VALID_UUID,
      sentryIssueId: "sentry-xyz",
      severity: "high",
      title: "TypeError",
    });
  });

  it("does NOT notify on idempotent retry (high → high)", async () => {
    // GitHub Actions が同じ severity でリトライした場合、行はすでに
    // 通知済みなので再送しない。
    //
    // GitHub Actions retries the AI workflow occasionally. If the row was
    // already escalated and the callback re-asserts the same severity, we
    // must NOT resend the alert.
    vi.resetModules();
    const notifySpy = vi.fn().mockResolvedValue({ email: { sent: true } });
    await vi.doMock("../../../services/notifier.js", () => ({
      notifyApiErrorAlert: notifySpy,
    }));
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const pre = {
      id: VALID_UUID,
      sentryIssueId: "sentry-xyz",
      severity: "high",
      title: "TypeError",
    };
    const updated = { ...pre };
    const { db } = createMockDb([[pre], [updated]]);
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
    expect(res.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("does NOT notify on partial callback that omits severity (already-escalated row)", async () => {
    // severity を含まない部分更新（例: ai_summary だけ refresh）。pre が
    // すでに `high` の行に対して再送が発生してはいけない。
    //
    // Partial callback that only refreshes a non-severity AI field on a row
    // already at `high`. Pre and post severity match, so the notifier must
    // not fire — even though the post-update severity is notifiable.
    vi.resetModules();
    const notifySpy = vi.fn().mockResolvedValue({ email: { sent: true } });
    await vi.doMock("../../../services/notifier.js", () => ({
      notifyApiErrorAlert: notifySpy,
    }));
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const pre = {
      id: VALID_UUID,
      sentryIssueId: "sentry-xyz",
      severity: "high",
      title: "TypeError",
    };
    const updated = { ...pre, aiSummary: "更新後の要約" };
    const { db } = createMockDb([[pre], [updated]]);
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
      body: JSON.stringify({ ai_summary: "更新後の要約" }),
    });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("does NOT notify when severity downgrades into low/unknown", async () => {
    // 通知済み行 (`high`) を `low` に下げるケースは通知しない。
    //
    // De-escalations from a notifiable severity back to `low`/`unknown`
    // must not produce a fresh alert.
    vi.resetModules();
    const notifySpy = vi.fn().mockResolvedValue({ email: { sent: true } });
    await vi.doMock("../../../services/notifier.js", () => ({
      notifyApiErrorAlert: notifySpy,
    }));
    await stubVerifyInstallationToken(true);
    const { default: routes } = await import("../../../routes/webhooks/githubAiCallback.js");
    const pre = {
      id: VALID_UUID,
      sentryIssueId: "sentry-xyz",
      severity: "high",
      title: "TypeError",
    };
    const updated = { ...pre, severity: "low" };
    const { db } = createMockDb([[pre], [updated]]);
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
      body: JSON.stringify({ severity: "low" }),
    });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
