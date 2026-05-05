/**
 * `apiErrorBroadcaster` 単体テスト。
 * subscribe / publish / capacity / unsubscribe の挙動を検証する。
 *
 * Unit tests for the in-memory `apiErrorBroadcaster` (subscribe, publish,
 * capacity guard, unsubscribe cleanup).
 *
 * @see ../../services/apiErrorBroadcaster.ts
 * @see https://github.com/otomatty/zedi/issues/807
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiErrorStreamCapacityExceededError,
  API_ERROR_STREAM_MAX_SUBSCRIBERS,
  apiErrorSubscriberCount,
  clearApiErrorSubscribers,
  publishApiErrorUpdate,
  subscribeApiErrorUpdates,
} from "../../services/apiErrorBroadcaster.js";
import type { ApiError } from "../../schema/apiErrors.js";

function makeRow(overrides: Partial<ApiError> = {}): ApiError {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    sentryIssueId: "sentry-1",
    fingerprint: null,
    title: "Test error",
    route: null,
    statusCode: 500,
    occurrences: 1,
    firstSeenAt: new Date("2026-05-01T00:00:00Z"),
    lastSeenAt: new Date("2026-05-04T00:00:00Z"),
    severity: "unknown",
    status: "open",
    aiSummary: null,
    aiSuspectedFiles: null,
    aiRootCause: null,
    aiSuggestedFix: null,
    githubIssueNumber: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-04T00:00:00Z"),
    ...overrides,
  };
}

afterEach(() => {
  clearApiErrorSubscribers();
});

describe("apiErrorBroadcaster", () => {
  it("delivers published rows to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeApiErrorUpdates(a);
    subscribeApiErrorUpdates(b);

    const row = makeRow();
    publishApiErrorUpdate(row);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(row);
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith(row);
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeApiErrorUpdates(listener);
    unsubscribe();

    publishApiErrorUpdate(makeRow());
    expect(listener).not.toHaveBeenCalled();
    expect(apiErrorSubscriberCount()).toBe(0);
  });

  it("isolates a throwing subscriber from the rest", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeApiErrorUpdates(bad);
    subscribeApiErrorUpdates(good);

    publishApiErrorUpdate(makeRow());

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("rejects subscribe past the cap", () => {
    for (let i = 0; i < API_ERROR_STREAM_MAX_SUBSCRIBERS; i++) {
      subscribeApiErrorUpdates(() => {});
    }
    expect(() => subscribeApiErrorUpdates(() => {})).toThrow(ApiErrorStreamCapacityExceededError);
    expect(apiErrorSubscriberCount()).toBe(API_ERROR_STREAM_MAX_SUBSCRIBERS);
  });

  it("counts active subscribers", () => {
    expect(apiErrorSubscriberCount()).toBe(0);
    const u1 = subscribeApiErrorUpdates(() => {});
    const u2 = subscribeApiErrorUpdates(() => {});
    expect(apiErrorSubscriberCount()).toBe(2);
    u1();
    expect(apiErrorSubscriberCount()).toBe(1);
    u2();
    expect(apiErrorSubscriberCount()).toBe(0);
  });
});
