/**
 * usePageSnapshotQueries のテスト
 * Tests for page snapshot React Query hooks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { snapshotKeys } from "./usePageSnapshotQueries";

// React Query wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("snapshotKeys", () => {
  it("all キーが正しい / all key is correct", () => {
    expect(snapshotKeys.all).toEqual(["pageSnapshots"]);
  });

  it("lists キーが正しい / lists key is correct", () => {
    expect(snapshotKeys.lists()).toEqual(["pageSnapshots", "list"]);
  });

  it("list(pageId) キーが正しい / list key includes pageId", () => {
    expect(snapshotKeys.list("page-1")).toEqual(["pageSnapshots", "list", "page-1"]);
  });

  it("details キーが正しい / details key is correct", () => {
    expect(snapshotKeys.details()).toEqual(["pageSnapshots", "detail"]);
  });

  it("detail(pageId, snapshotId) キーが正しい / detail key includes both ids", () => {
    expect(snapshotKeys.detail("page-1", "snap-1")).toEqual([
      "pageSnapshots",
      "detail",
      "page-1",
      "snap-1",
    ]);
  });
});

// ── Hook tests (mock API) ──────────────────────────────────────────────────

const mockGetPageSnapshots = vi.fn();
const mockGetPageSnapshot = vi.fn();
const mockRestorePageSnapshot = vi.fn();

vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    getPageSnapshots: mockGetPageSnapshots,
    getPageSnapshot: mockGetPageSnapshot,
    restorePageSnapshot: mockRestorePageSnapshot,
  }),
}));

// Re-import after mock is set up
const { usePageSnapshots, usePageSnapshot, useRestorePageSnapshot } =
  await import("./usePageSnapshotQueries");

describe("usePageSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("スナップショット一覧を取得して変換する / fetches and transforms snapshot list", async () => {
    mockGetPageSnapshots.mockResolvedValueOnce({
      snapshots: [
        {
          id: "s1",
          version: 3,
          content_text: "text",
          created_by: "u1",
          created_by_email: "u@example.com",
          trigger: "auto",
          created_at: "2026-04-07T12:00:00Z",
        },
      ],
    });

    const { result } = renderHook(() => usePageSnapshots("page-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toEqual({
      id: "s1",
      version: 3,
      contentText: "text",
      createdBy: "u1",
      createdByEmail: "u@example.com",
      trigger: "auto",
      createdAt: "2026-04-07T12:00:00Z",
    });
  });

  it("pageId が空の場合はクエリを無効化する / disables query when pageId is empty", () => {
    const { result } = renderHook(() => usePageSnapshots(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("usePageSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("スナップショット詳細を取得して変換する / fetches and transforms snapshot detail", async () => {
    mockGetPageSnapshot.mockResolvedValueOnce({
      id: "s1",
      version: 5,
      ydoc_state: "base64data",
      content_text: "detail",
      created_by: "u1",
      created_by_email: "u@example.com",
      trigger: "auto",
      created_at: "2026-04-07T12:00:00Z",
    });

    const { result } = renderHook(() => usePageSnapshot("page-1", "s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      id: "s1",
      version: 5,
      ydocState: "base64data",
      contentText: "detail",
      createdBy: "u1",
      createdByEmail: "u@example.com",
      trigger: "auto",
      createdAt: "2026-04-07T12:00:00Z",
    });
  });

  it("snapshotId が null の場合はクエリを無効化する / disables query when snapshotId is null", () => {
    const { result } = renderHook(() => usePageSnapshot("page-1", null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useRestorePageSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("復元 API を呼び出す / calls restore API", async () => {
    mockRestorePageSnapshot.mockResolvedValueOnce({ version: 6, snapshot_id: "snap-new" });

    const { result } = renderHook(() => useRestorePageSnapshot("page-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("snap-1");

    expect(mockRestorePageSnapshot).toHaveBeenCalledWith("page-1", "snap-1");
  });
});
