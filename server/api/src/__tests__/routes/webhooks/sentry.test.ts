/**
 * `POST /api/webhooks/sentry` のテスト。
 *
 * - 署名 OK: 200 + DB upsert（モックチェーンの呼び出しを検証）
 * - 署名 NG: 403
 * - 署名ヘッダ欠落: 403
 * - シークレット未設定: 500
 * - sentry_issue_id を抽出できないペイロード: 200 + ignored
 *
 * Tests for the Sentry Internal Integration webhook receiver.
 */
import crypto from "node:crypto";
import { Hono } from "hono";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

// notes/setup.js を経由して middleware/auth.js が auth.ts を読み込まないよう、
// テスト先頭でモックする（webhook ルート自体は auth に依存しない）。
// Mock middleware/auth before importing notes/setup so the transitive
// `import { auth } from "../auth.js"` (which needs DATABASE_URL) is short-circuited.
// The webhook route itself does not depend on auth — this mock just keeps the
// shared `createMockDb` import side-effect-free in this test file.
vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
  authOptional: async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

import sentryRoutes, { extractSentrySummary } from "../../../routes/webhooks/sentry.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import { createMockDb } from "../notes/setup.js";

const TEST_SECRET = "sentry-test-client-secret";

/**
 * テスト用アプリ。dbResults はハンドラ内のクエリ結果を順番に返す。
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
  app.route("/api/webhooks/sentry", sentryRoutes);
  return { app, chains };
}

/**
 * 与えられた body から Sentry-Hook-Signature 互換の HMAC-SHA256 hex を計算する。
 * Compute the matching HMAC-SHA256 hex signature for a body.
 */
function sign(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("extractSentrySummary", () => {
  it("returns null when payload is not an object", () => {
    expect(extractSentrySummary(null)).toBeNull();
    expect(extractSentrySummary("nope")).toBeNull();
    expect(extractSentrySummary(42)).toBeNull();
  });

  it("returns null when no sentry_issue_id can be located", () => {
    expect(extractSentrySummary({ data: {} })).toBeNull();
    expect(extractSentrySummary({ data: { event: { tags: [] } } })).toBeNull();
  });

  it("extracts from data.issue (issue.created shape)", () => {
    const result = extractSentrySummary({
      action: "created",
      data: {
        issue: {
          id: "1234567890",
          title: "TypeError: x is undefined",
          shortId: "API-1A",
          metadata: { transaction: "POST /api/ingest" },
        },
      },
    });
    expect(result).not.toBeNull();
    expect(result?.sentryIssueId).toBe("1234567890");
    expect(result?.title).toBe("TypeError: x is undefined");
    expect(result?.route).toBe("POST /api/ingest");
  });

  it("extracts from data.event with request + contexts.response, stripping URL to path", () => {
    // フォールバックで URL を使う場合は origin / query / fragment を削り、
    // pathname だけを残す（capability token や絶対 URL を api_errors.route に
    // 入れないため）。
    // When falling back to request.url, strip origin / query / fragment so we
    // never persist capability tokens or absolute URLs into api_errors.route.
    const result = extractSentrySummary({
      action: "triggered",
      data: {
        event: {
          issue_id: "9999",
          title: "ReferenceError: foo is not defined",
          request: {
            method: "POST",
            url: "https://example.com/api/ingest?token=secret#frag",
          },
          contexts: { response: { status_code: 500 } },
          fingerprint: ["abc-123"],
        },
      },
    });
    expect(result?.sentryIssueId).toBe("9999");
    expect(result?.statusCode).toBe(500);
    expect(result?.fingerprint).toBe("abc-123");
    expect(result?.route).toBe("POST /api/ingest");
  });

  it("prefers tags.transaction over request.url when both exist", () => {
    // tags.transaction はスクラブ済みのルートテンプレなのでそちらを優先する。
    // The transaction tag carries Sentry's already-scrubbed route template, so
    // it wins over a raw request URL.
    const result = extractSentrySummary({
      data: {
        event: {
          issue_id: "1",
          title: "boom",
          request: { method: "GET", url: "https://example.com/api/ingest?token=secret" },
          tags: [["transaction", "GET /api/pages/:id"]],
        },
      },
    });
    expect(result?.route).toBe("GET /api/pages/:id");
  });

  it("extracts from data.error when issue/event slots are absent", () => {
    // 一部の Sentry イベント種別では識別子が data.error 配下にしかない。
    // For event shapes where the id only lives under `data.error`, the
    // extractor must still locate it; otherwise those errors silently drop
    // out of admin error tracking.
    const result = extractSentrySummary({
      data: {
        error: {
          id: "error-only-77",
          title: "Some API error",
        },
      },
    });
    expect(result?.sentryIssueId).toBe("error-only-77");
    expect(result?.title).toBe("Some API error");
  });

  it("falls back to a default title when none is provided", () => {
    const result = extractSentrySummary({
      data: { issue: { id: "noTitle" } },
    });
    expect(result?.sentryIssueId).toBe("noTitle");
    expect(result?.title).toBe("Sentry issue");
  });

  it("reads transaction tag from array-of-tuples format", () => {
    const result = extractSentrySummary({
      data: {
        event: {
          issue_id: "55",
          title: "boom",
          tags: [
            ["transaction", "GET /api/pages/:id"],
            ["response.status_code", "404"],
          ],
        },
      },
    });
    expect(result?.route).toBe("GET /api/pages/:id");
    expect(result?.statusCode).toBe(404);
  });
});

describe("POST /api/webhooks/sentry", () => {
  const ORIGINAL_ENV = process.env.SENTRY_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.SENTRY_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.SENTRY_WEBHOOK_SECRET = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("returns 200 and upserts the issue when signature matches", async () => {
    const upsertedRow = {
      id: "00000000-0000-0000-0000-0000000000aa",
      sentryIssueId: "abc-123",
      occurrences: 1,
    };
    // upsertFromSentrySummary issues a single insert chain that resolves to [row].
    const { app, chains } = createApp([[upsertedRow]]);
    const body = JSON.stringify({
      action: "created",
      data: {
        issue: {
          id: "abc-123",
          title: "TypeError: cannot read properties of undefined",
          metadata: { transaction: "POST /api/ingest" },
        },
      },
    });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": sign(body),
        "sentry-hook-resource": "issue",
      },
      body,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; id: string };
    expect(json.received).toBe(true);
    expect(json.id).toBe(upsertedRow.id);

    // The handler issued exactly one insert chain.
    const insertChains = chains.filter((c) => c.startMethod === "insert");
    expect(insertChains).toHaveLength(1);
  });

  it("returns 403 when signature is missing", async () => {
    const { app } = createApp([]);
    const body = JSON.stringify({ data: { issue: { id: "x", title: "y" } } });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when signature does not match the body", async () => {
    const { app } = createApp([]);
    const body = JSON.stringify({ data: { issue: { id: "x", title: "y" } } });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": sign("different-body"),
      },
      body,
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when signature is computed with a different secret", async () => {
    const { app } = createApp([]);
    const body = JSON.stringify({ data: { issue: { id: "x", title: "y" } } });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": sign(body, "wrong-secret"),
      },
      body,
    });

    expect(res.status).toBe(403);
  });

  it("returns 500 when SENTRY_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.SENTRY_WEBHOOK_SECRET;
    const { app } = createApp([]);
    const body = JSON.stringify({ data: { issue: { id: "x", title: "y" } } });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": "anything",
      },
      body,
    });

    expect(res.status).toBe(500);
  });

  it("returns 200 + ignored when no sentry_issue_id can be extracted", async () => {
    const { app, chains } = createApp([]);
    const body = JSON.stringify({ action: "ping", data: {} });

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": sign(body),
        "sentry-hook-resource": "installation",
      },
      body,
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; ignored: boolean };
    expect(json).toMatchObject({ received: true, ignored: true });
    // No DB chain was issued: payload was acknowledged without an insert.
    expect(chains).toHaveLength(0);
  });

  it("returns 400 when body is not valid JSON (signature still required)", async () => {
    const { app } = createApp([]);
    const body = "{not-json";

    const res = await app.request("/api/webhooks/sentry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sentry-hook-signature": sign(body),
      },
      body,
    });

    expect(res.status).toBe(400);
  });
});
