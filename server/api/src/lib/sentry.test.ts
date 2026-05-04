/**
 * `lib/sentry.ts` のユニットテスト。
 *
 * - DSN 未設定では Sentry SDK を初期化せず no-op にする。
 * - DSN 設定時は beforeSend で代表的な PII キーをスクラブする。
 * - API error handler から渡された例外は Sentry.captureException へ status/context 付きで送る。
 *
 * Unit tests for the Sentry wrapper. Covers no-DSN no-op initialization,
 * beforeSend PII scrubbing, and captureException context forwarding.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/bun";

const sentrySdkMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/bun", () => sentrySdkMock);

import { captureApiException, initSentry } from "./sentry.js";

describe("Sentry API wrapper", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    sentrySdkMock.captureException.mockReset();
    sentrySdkMock.init.mockReset();
  });

  it("does not initialize the SDK when SENTRY_DSN_API is empty", () => {
    delete process.env.SENTRY_DSN_API;

    expect(() => initSentry()).not.toThrow();
    expect(sentrySdkMock.init).not.toHaveBeenCalled();
  });

  it("initializes the SDK and scrubs sensitive event fields before send", () => {
    process.env.SENTRY_DSN_API = "https://public@example.com/1";

    initSentry();

    expect(sentrySdkMock.init).toHaveBeenCalledTimes(1);
    const [options] = sentrySdkMock.init.mock.calls[0] as [
      { beforeSend: (event: ErrorEvent) => ErrorEvent | null },
    ];
    const scrubbed = options.beforeSend({
      type: undefined,
      request: {
        headers: {
          Authorization: "Bearer secret",
          Cookie: "sid=secret",
          "x-safe": "ok",
        },
        data: {
          email: "user@example.com",
          nested: { password: "secret", keep: "value" },
        },
      },
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      extra: {
        token: "secret-token",
        safe: "value",
      },
    });

    expect(scrubbed?.request?.headers).toMatchObject({
      Authorization: "[Filtered]",
      Cookie: "[Filtered]",
      "x-safe": "ok",
    });
    expect(scrubbed?.request?.data).toMatchObject({
      email: "[Filtered]",
      nested: { password: "[Filtered]", keep: "value" },
    });
    expect(scrubbed?.user).toMatchObject({ id: "user-1", email: "[Filtered]" });
    expect(scrubbed?.extra).toMatchObject({ token: "[Filtered]", safe: "value" });
  });

  it("captures API exceptions with HTTP status and route context", () => {
    const err = new Error("kapow");

    captureApiException(err, 500, { method: "POST", path: "/api/example" });

    expect(sentrySdkMock.captureException).toHaveBeenCalledWith(err, {
      tags: { httpStatus: "500" },
      extra: { method: "POST", path: "/api/example" },
    });
  });
});
