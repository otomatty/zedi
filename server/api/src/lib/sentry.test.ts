/**
 * `lib/sentry.ts` のユニットテスト。
 *
 * - DSN 未設定では Sentry SDK を初期化せず no-op にする。
 * - DSN 設定時は beforeSend で代表的な PII キーをスクラブする。
 * - 文字列値に埋め込まれた `?token=...` 等の query param もスクラブする。
 * - 全イベントを再帰再構築せず、`Date` 等の非 plain object と循環参照を保護する。
 * - API error handler から渡された例外は Sentry.captureException へ status/context 付きで送る。
 *
 * Unit tests for the Sentry wrapper. Covers no-DSN no-op initialization,
 * targeted PII scrubbing (including URL query parameters) without corrupting
 * non-plain objects or recursing through cycles, and captureException
 * context forwarding.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/node";

const sentrySdkMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@sentry/node", () => sentrySdkMock);

import { captureApiException, initSentry, scrubSentryEvent } from "./sentry.js";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent;
}

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

  it("initializes the SDK with sendDefaultPii: false and a scrubbing beforeSend", () => {
    process.env.SENTRY_DSN_API = "https://public@example.com/1";

    initSentry();

    expect(sentrySdkMock.init).toHaveBeenCalledTimes(1);
    const [options] = sentrySdkMock.init.mock.calls[0] as [
      { sendDefaultPii?: boolean; beforeSend?: (event: ErrorEvent) => ErrorEvent | null },
    ];
    expect(options.sendDefaultPii).toBe(false);
    expect(typeof options.beforeSend).toBe("function");
  });

  it("captures API exceptions with HTTP status and route context", () => {
    const err = new Error("kapow");

    captureApiException(err, 500, { method: "POST", routePath: "/api/example/:id" });

    expect(sentrySdkMock.captureException).toHaveBeenCalledWith(err, {
      tags: { httpStatus: "500" },
      extra: { method: "POST", routePath: "/api/example/:id" },
    });
  });
});

describe("scrubSentryEvent", () => {
  it("scrubs sensitive headers, cookies, and request data", () => {
    const event = makeEvent({
      request: {
        headers: {
          Authorization: "Bearer secret",
          Cookie: "sid=secret",
          "x-safe": "ok",
        },
        cookies: {
          session: "secret",
          email: "user@example.com",
        },
        data: {
          email: "user@example.com",
          nested: { password: "secret", keep: "value" },
        },
        query_string: "page=1&token=secret-capability&safe=ok",
      },
    });

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers).toMatchObject({
      Authorization: "[Filtered]",
      Cookie: "[Filtered]",
      "x-safe": "ok",
    });
    expect(scrubbed.request?.cookies).toMatchObject({
      session: "[Filtered]",
      email: "[Filtered]",
    });
    expect(scrubbed.request?.data).toMatchObject({
      email: "[Filtered]",
      nested: { password: "[Filtered]", keep: "value" },
    });
    expect(scrubbed.request?.query_string).toBe("page=1&token=[Filtered]&safe=ok");
  });

  it("scrubs user, extra, contexts, tags, and breadcrumb data", () => {
    const event = makeEvent({
      user: { id: "user-1", email: "user@example.com" },
      extra: {
        token: "secret",
        nested: { password: "secret", keep: "value" },
      },
      contexts: { runtime: { name: "node" }, secret: { value: "xyz" } } as ErrorEvent["contexts"],
      tags: { region: "tokyo", token: "leak" },
      breadcrumbs: [
        { category: "http", data: { authorization: "Bearer xxx", url: "/x?token=abc" } },
      ],
    });

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.user).toMatchObject({ id: "user-1", email: "[Filtered]" });
    expect(scrubbed.extra).toMatchObject({
      token: "[Filtered]",
      nested: { password: "[Filtered]", keep: "value" },
    });
    expect(scrubbed.contexts).toMatchObject({
      runtime: { name: "node" },
      secret: "[Filtered]",
    } as Record<string, unknown>);
    expect(scrubbed.tags).toMatchObject({ region: "tokyo", token: "[Filtered]" });
    expect(scrubbed.breadcrumbs?.[0]?.data).toMatchObject({
      authorization: "[Filtered]",
      url: "/x?token=[Filtered]",
    });
  });

  it("preserves non-plain objects (Date, RegExp) embedded in extra/data", () => {
    const date = new Date("2026-05-04T00:00:00Z");
    const regex = /^safe$/i;
    const event = makeEvent({
      extra: { createdAt: date, pattern: regex, keep: "value" },
    });

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toBeDefined();
    expect((scrubbed.extra as Record<string, unknown>).createdAt).toBe(date);
    expect((scrubbed.extra as Record<string, unknown>).pattern).toBe(regex);
    expect((scrubbed.extra as Record<string, unknown>).keep).toBe("value");
  });

  it("does not stack overflow on circular references", () => {
    const cyclic: Record<string, unknown> = { keep: "value" };
    cyclic.self = cyclic;
    const event = makeEvent({ extra: { cyclic } });

    const scrubbed = scrubSentryEvent(event);

    const extra = scrubbed.extra as Record<string, unknown>;
    const inner = extra.cyclic as Record<string, unknown>;
    expect(inner.keep).toBe("value");
    expect(inner.self).toBe("[Circular]");
  });

  it("redacts sensitive query params embedded in arbitrary string values", () => {
    const event = makeEvent({
      extra: {
        landingUrl: "https://example.com/cb?token=abc&access_token=def&password=hunter2&page=1",
      },
    });

    const scrubbed = scrubSentryEvent(event);

    expect((scrubbed.extra as Record<string, unknown>).landingUrl).toBe(
      "https://example.com/cb?token=[Filtered]&access_token=[Filtered]&password=[Filtered]&page=1",
    );
  });
});
