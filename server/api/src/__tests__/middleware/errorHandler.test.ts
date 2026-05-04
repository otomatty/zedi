/**
 * `middleware/errorHandler.ts` のユニットテスト。
 *
 * - HTTPException はそのままステータスとメッセージを返す。
 * - サービス層が throw する `new Error("UNAUTHORIZED")` などの
 *   "magic message" は statusMap に従って HTTP ステータスへ写像される。
 * - 未知のエラーは 500 を返し、message は「Internal server error」または素のエラー文。
 *
 * Unit tests for the global Hono error handler. Covers HTTPException pass-through,
 * the magic-message → status mapping, and the unknown-error 500 default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../types/index.js";

const sentryMock = vi.hoisted(() => ({
  captureApiException: vi.fn(),
  shouldCaptureApiException: vi.fn(
    (status: number) =>
      status >= 500 || (status >= 400 && status < 500 && ![401, 403, 404].includes(status)),
  ),
}));

vi.mock("../../lib/sentry.js", () => sentryMock);

import { errorHandler } from "../../middleware/errorHandler.js";

/**
 * Build an app whose `/throw` route throws the supplied error.
 * テスト対象のエラーを必ず throw するルートを持つアプリを作る。
 */
function appThrowing(err: unknown) {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.get("/throw", () => {
    throw err;
  });
  return app;
}

describe("errorHandler", () => {
  // 例外発生時に console.error が呼ばれるため、テスト中は黙らせる。
  // Silence the `[api] ...` log lines emitted on every error path.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    sentryMock.captureApiException.mockReset();
  });

  describe("HTTPException pass-through", () => {
    it("preserves the HTTPException status code", async () => {
      const res = await appThrowing(new HTTPException(418, { message: "I'm a teapot" })).request(
        "/throw",
      );
      expect(res.status).toBe(418);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("I'm a teapot");
    });

    it("returns 401 for an unauthorized HTTPException", async () => {
      const res = await appThrowing(new HTTPException(401, { message: "no" })).request("/throw");
      expect(res.status).toBe(401);
    });

    it("returns 403 for a forbidden HTTPException", async () => {
      const res = await appThrowing(new HTTPException(403, { message: "denied" })).request(
        "/throw",
      );
      expect(res.status).toBe(403);
    });

    it.each([401, 403, 404] as const)(
      "does not capture expected HTTP %d errors",
      async (status) => {
        await appThrowing(new HTTPException(status, { message: "expected" })).request("/throw");

        expect(sentryMock.captureApiException).not.toHaveBeenCalled();
      },
    );

    it.each([400, 409, 422] as const)("captures unexpected HTTP %d errors", async (status) => {
      const err = new HTTPException(status, { message: "unexpected" });

      await appThrowing(err).request("/throw");

      expect(sentryMock.captureApiException).toHaveBeenCalledWith(
        err,
        status,
        expect.objectContaining({
          method: "GET",
          path: "/throw",
        }),
      );
    });
  });

  describe("statusMap (magic message) mapping", () => {
    // 各エントリは Error message → 期待 HTTP ステータス。
    // Each magic message must map to exactly the documented status.
    it.each([
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["RATE_LIMIT_EXCEEDED", 429],
      ["STORAGE_QUOTA_EXCEEDED", 403],
      ["NOT_FOUND", 404],
      ["BAD_REQUEST", 400],
      ["CONFLICT", 409],
      ["VALIDATION_FAILED", 422],
    ] as const)("maps Error('%s') to %d", async (message, expected) => {
      const res = await appThrowing(new Error(message)).request("/throw");
      expect(res.status).toBe(expected);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(message);
    });
  });

  describe("Sentry capture policy", () => {
    it.each([
      ["UNAUTHORIZED", 401],
      ["FORBIDDEN", 403],
      ["NOT_FOUND", 404],
      ["STORAGE_QUOTA_EXCEEDED", 403],
    ] as const)("does not capture expected Error('%s') as %d", async (message, _expectedStatus) => {
      await appThrowing(new Error(message)).request("/throw");

      expect(sentryMock.captureApiException).not.toHaveBeenCalled();
    });

    it.each([
      ["BAD_REQUEST", 400],
      ["CONFLICT", 409],
      ["VALIDATION_FAILED", 422],
      ["RATE_LIMIT_EXCEEDED", 429],
      ["kapow", 500],
    ] as const)("captures Error('%s') mapped to %d", async (message, expectedStatus) => {
      const err = new Error(message);

      await appThrowing(err).request("/throw");

      expect(sentryMock.captureApiException).toHaveBeenCalledWith(
        err,
        expectedStatus,
        expect.objectContaining({
          method: "GET",
          path: "/throw",
        }),
      );
    });
  });

  describe("unknown errors", () => {
    it("returns 500 for an Error with an unmapped message and echoes the message", async () => {
      const res = await appThrowing(new Error("kapow")).request("/throw");
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("kapow");
    });

    it("logs the error with method and path context", async () => {
      await appThrowing(new Error("BAD_REQUEST")).request("/throw");
      // statusMap によるマッピング後にログが残ること。
      // Verify the `[api] GET /throw → 400` log line was emitted.
      expect(errorSpy).toHaveBeenCalled();
      const firstCall = errorSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const firstArg = firstCall?.[0];
      expect(typeof firstArg).toBe("string");
      expect(firstArg as string).toContain("GET");
      expect(firstArg as string).toContain("/throw");
      expect(firstArg as string).toContain("400");
    });
  });
});
