/**
 * `useInfiniteNotePages` unit tests (issue #860 Phase 3).
 *
 * keyset cursor を辿る経路、`next_cursor: null` 終端、include / pageSize の
 * クエリ反映、フラット化したサマリの順序を検証する。
 *
 * Verifies the keyset-cursor pagination flow, terminal `next_cursor: null`
 * handling, propagation of `include` / `pageSize` to the API client, and the
 * flattened summary ordering returned by the hook.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotePageWindowItem, NotePageWindowResponse } from "@/lib/api/types";

const mockGetNotePages = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue(null),
    isSignedIn: true,
    userId: "user-1",
    isLoaded: true,
  }),
  useUser: () => ({
    user: { primaryEmailAddress: { emailAddress: "user-1@example.com" } },
  }),
}));

vi.mock("@/lib/api", () => ({
  createApiClient: () => ({
    getNotePages: (
      noteId: string,
      params: {
        cursor?: string | null;
        limit?: number;
        include?: ReadonlyArray<"preview" | "thumbnail">;
      },
    ) => mockGetNotePages(noteId, params),
  }),
}));

// `pageKeys` / `useRepository` は他のミューテーション系で参照されるだけで、
// `useInfiniteNotePages` 単体テストでは触らないので空モックで十分。
// `pageKeys` / `useRepository` only matter for the mutation hooks; stub them so
// importing the module under test does not pull in IndexedDB plumbing.
vi.mock("@/hooks/usePageQueries", () => ({
  pageKeys: { list: () => [], summary: () => [], byTitles: () => [], all: [] },
  useRepository: () => ({ getRepository: vi.fn() }),
}));

import { useInfiniteNotePages } from "./useNoteQueries";

function makeItem(id: string, updatedAt: string): NotePageWindowItem {
  return {
    id,
    owner_id: "user-1",
    note_id: "note-1",
    source_page_id: null,
    title: `Title ${id}`,
    content_preview: `preview ${id}`,
    thumbnail_url: null,
    source_url: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    is_deleted: false,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperWithClient(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockGetNotePages.mockReset();
});

describe("useInfiniteNotePages", () => {
  it("issues the first request without a cursor and with default include / pageSize", async () => {
    const resp: NotePageWindowResponse = {
      items: [makeItem("p1", "2026-05-13T10:00:00.000000Z")],
      next_cursor: null,
    };
    mockGetNotePages.mockResolvedValueOnce(resp);

    const { result } = renderHook(() => useInfiniteNotePages("note-1"), {
      wrapper: wrapperWithClient(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetNotePages).toHaveBeenCalledTimes(1);
    expect(mockGetNotePages).toHaveBeenCalledWith("note-1", {
      cursor: null,
      limit: 50,
      include: ["preview", "thumbnail"],
    });
    expect(result.current.pages).toHaveLength(1);
    expect(result.current.pages[0]?.id).toBe("p1");
    expect(result.current.pages[0]?.contentPreview).toBe("preview p1");
    expect(result.current.hasNextPage).toBe(false);
  });

  it("threads next_cursor into the next request and flattens both windows", async () => {
    mockGetNotePages
      .mockResolvedValueOnce({
        items: [makeItem("p1", "2026-05-13T10:00:00.000000Z")],
        next_cursor: "cursor-abc",
      })
      .mockResolvedValueOnce({
        items: [makeItem("p2", "2026-05-13T09:00:00.000000Z")],
        next_cursor: null,
      });

    const { result } = renderHook(
      () => useInfiniteNotePages("note-1", { pageSize: 25, include: ["preview"] }),
      { wrapper: wrapperWithClient(makeQueryClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
    expect(mockGetNotePages).toHaveBeenLastCalledWith("note-1", {
      cursor: null,
      limit: 25,
      include: ["preview"],
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    expect(mockGetNotePages).toHaveBeenCalledTimes(2);
    expect(mockGetNotePages).toHaveBeenLastCalledWith("note-1", {
      cursor: "cursor-abc",
      limit: 25,
      include: ["preview"],
    });
    expect(result.current.pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("does not fetch when disabled via the enabled option", async () => {
    mockGetNotePages.mockResolvedValue({ items: [], next_cursor: null });

    const { result } = renderHook(() => useInfiniteNotePages("note-1", { enabled: false }), {
      wrapper: wrapperWithClient(makeQueryClient()),
    });

    // 同期的に何も読みに行かないことを最低限確認する。`useQuery` の `enabled:
    // false` 経路は `isLoading` が `false` のまま保たれる。
    // Verify the disabled gate keeps the query inert; `useQuery({ enabled:
    // false })` reports `isLoading: false` and never invokes the queryFn.
    expect(mockGetNotePages).not.toHaveBeenCalled();
    expect(result.current.pages).toEqual([]);
  });

  it("does not fetch when noteId is empty", async () => {
    mockGetNotePages.mockResolvedValue({ items: [], next_cursor: null });

    renderHook(() => useInfiniteNotePages(""), {
      wrapper: wrapperWithClient(makeQueryClient()),
    });

    expect(mockGetNotePages).not.toHaveBeenCalled();
  });
});
