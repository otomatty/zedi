/**
 * `useApiErrors` の単体テスト。
 * SSE で push された行を初期取得結果にマージできること、フィルタ非該当な行を
 * 無視すること、アンマウント時に EventSource を close することを検証する。
 *
 * Unit tests for `useApiErrors`. Verifies that pushed SSE rows merge into the
 * REST-bootstrapped list, filter mismatches are ignored, and the EventSource
 * is closed on unmount (no fd leaks).
 *
 * @see ./useApiErrors.ts
 * @see https://github.com/otomatty/zedi/issues/807
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ApiErrorRow, GetApiErrorsResponse } from "@/api/admin";

// `getApiErrors` を mock してネットワーク呼び出しを避ける。
// Mock the REST helper so the hook's bootstrap fetch returns a fixed payload.
vi.mock("@/api/admin", async (orig) => {
  const actual = await orig<typeof import("@/api/admin")>();
  return {
    ...actual,
    getApiErrors: vi.fn(),
  };
});

const { getApiErrors } = await import("@/api/admin");
const { useApiErrors } = await import("./useApiErrors");

type Listener = (event: MessageEvent<string>) => void;

interface FakeEventSource {
  url: string;
  withCredentials: boolean;
  closed: boolean;
  close: () => void;
  onerror: ((ev: Event) => void) | null;
  addEventListener: (type: string, cb: Listener) => void;
  dispatch: (type: string, payload: unknown) => void;
}

let lastInstance: FakeEventSource | null = null;

function createFakeEventSourceCtor(): typeof EventSource {
  // テスト用の最小限の EventSource 互換 stub。`new` で生成された各インスタンスを
  // `lastInstance` に保存し、テスト本文から `dispatch` で擬似イベントを送れるようにする。
  // Minimal EventSource stub. Each new instance is stashed in `lastInstance` so
  // the test body can dispatch events imperatively without touching `this`.
  function build(url: string, init?: { withCredentials?: boolean }): FakeEventSource {
    const listeners = new Map<string, Set<Listener>>();
    const instance: FakeEventSource = {
      url,
      withCredentials: init?.withCredentials ?? false,
      closed: false,
      onerror: null,
      close: () => {
        instance.closed = true;
      },
      addEventListener: (type, cb) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(cb);
      },
      dispatch: (type, payload) => {
        const event = {
          type,
          data: typeof payload === "string" ? payload : JSON.stringify(payload),
        } as MessageEvent<string>;
        listeners.get(type)?.forEach((cb) => cb(event));
      },
    };
    lastInstance = instance;
    return instance;
  }
  // EventSource は `new` で呼ばれるので、関数を `new` 互換に見せかけるラッパで返す。
  // EventSource is constructor-called; wrap `build` so `new EventSource(...)`
  // forwards to it.
  return function EventSourceCtor(url: string, init?: { withCredentials?: boolean }) {
    return build(url, init);
  } as unknown as typeof EventSource;
}

function getInstance(): FakeEventSource {
  if (!lastInstance) throw new Error("EventSource has not been instantiated");
  return lastInstance;
}

const FIXED_RESPONSE: GetApiErrorsResponse = {
  errors: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-1",
      fingerprint: null,
      title: "old error",
      route: "GET /api/foo",
      statusCode: 500,
      occurrences: 1,
      firstSeenAt: "2026-05-01T00:00:00Z",
      lastSeenAt: "2026-05-04T00:00:00Z",
      severity: "unknown",
      status: "open",
      aiSummary: null,
      aiSuspectedFiles: null,
      aiRootCause: null,
      aiSuggestedFix: null,
      githubIssueNumber: null,
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-04T00:00:00Z",
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

function getBaseRow(): ApiErrorRow {
  const base = FIXED_RESPONSE.errors[0];
  if (!base) throw new Error("FIXED_RESPONSE must have at least one row");
  return base;
}

function makePushed(overrides: Partial<ApiErrorRow> = {}): ApiErrorRow {
  return {
    ...getBaseRow(),
    id: "00000000-0000-0000-0000-0000000000aa",
    title: "new pushed error",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getApiErrors).mockResolvedValue(FIXED_RESPONSE);
  lastInstance = null;
  // jsdom には EventSource が無いので global に注入する。
  // jsdom doesn't ship EventSource; install our fake on globalThis.
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    createFakeEventSourceCtor();
});

afterEach(() => {
  vi.restoreAllMocks();
  // EventSource を消して次のテストの環境を汚染しないようにする。
  // Strip our fake so the next test boots from a clean slate.
  delete (globalThis as { EventSource?: unknown }).EventSource;
});

describe("useApiErrors", () => {
  it("loads via REST and exposes the rows", async () => {
    const { result } = renderHook(() => useApiErrors({ intervalMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errors).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it("opens an EventSource on mount (URL routed through getApiUrl) and closes it on unmount", async () => {
    const { unmount } = renderHook(() => useApiErrors({ intervalMs: 0 }));
    await waitFor(() => expect(lastInstance).not.toBeNull());
    const es = getInstance();
    // `getApiUrl` 経由なので、`VITE_API_BASE_URL` が空文字でもフルパスは
    // `/api/admin/errors/stream` を含む。
    // `getApiUrl` resolves the path; with an empty `VITE_API_BASE_URL` it
    // stays same-origin, so the URL still ends with the SSE path.
    expect(es.url).toContain("/api/admin/errors/stream");
    expect(es.withCredentials).toBe(true);
    unmount();
    expect(es.closed).toBe(true);
  });

  it("merges an `update` SSE event by id and moves the row to the front", async () => {
    // 初期一覧に 2 件目の行を返すように mockResolvedValue を上書きし、
    // 2 番目の行を更新したらリストの先頭へ移動することを確認する。
    // Bootstrap with two rows so we can verify the second row is *moved* to
    // the front (matching the server's `last_seen_at DESC` ordering) rather
    // than replaced in place.
    const second: ApiErrorRow = {
      ...getBaseRow(),
      id: "00000000-0000-0000-0000-0000000000bb",
      title: "second",
    };
    vi.mocked(getApiErrors).mockResolvedValueOnce({
      errors: [getBaseRow(), second],
      total: 2,
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useApiErrors({ intervalMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      getInstance().dispatch("ready", "");
    });

    const updatedSecond = { ...second, title: "second (updated)" };
    act(() => {
      getInstance().dispatch("update", updatedSecond);
    });

    expect(result.current.errors).toHaveLength(2);
    expect(result.current.errors[0]?.id).toBe(second.id);
    expect(result.current.errors[0]?.title).toBe("second (updated)");
    expect(result.current.errors[1]?.id).toBe(getBaseRow().id);
    expect(result.current.total).toBe(2);
    expect(result.current.streamConnected).toBe(true);
  });

  it("prepends a brand-new id and bumps total", async () => {
    const { result } = renderHook(() => useApiErrors({ intervalMs: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fresh = makePushed();
    act(() => {
      getInstance().dispatch("ready", "");
      getInstance().dispatch("update", fresh);
    });

    expect(result.current.errors[0]?.id).toBe(fresh.id);
    expect(result.current.errors).toHaveLength(2);
    expect(result.current.total).toBe(2);
  });

  it("ignores rows that don't match the active filter", async () => {
    const { result } = renderHook(() =>
      useApiErrors({ status: "open", severity: "high", intervalMs: 0 }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const mismatch = makePushed({ status: "resolved", severity: "low" });
    act(() => {
      getInstance().dispatch("ready", "");
      getInstance().dispatch("update", mismatch);
    });

    expect(result.current.errors).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it("does not open EventSource when enableStream is false", async () => {
    renderHook(() => useApiErrors({ intervalMs: 0, enableStream: false }));
    await waitFor(() => expect(getApiErrors).toHaveBeenCalled());
    expect(lastInstance).toBeNull();
  });
});
