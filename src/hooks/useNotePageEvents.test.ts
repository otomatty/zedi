/**
 * `useNotePageEvents` / `applyNoteEventToCache` のユニットテスト (Issue #860 Phase 4)。
 *
 * Unit tests for the note SSE event cache patcher (Issue #860 Phase 4).
 * Drives `applyNoteEventToCache` directly against a real `QueryClient` so the
 * `setQueriesData` patch logic is verified against `useInfiniteNotePages`'s
 * actual query key contract (`noteKeys.pagesWindowByNoteId`).
 *
 * @see ./useNotePageEvents.ts
 * @see ./useNoteQueries.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import { describe, it, expect } from "vitest";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { NotePageWindowItem, NotePageWindowResponse } from "@/lib/api/types";
import type { NoteEvent } from "@/lib/api/noteEvents";
import { applyNoteEventToCache } from "./useNotePageEvents";
import { noteKeys } from "./useNoteQueries";

const NOTE_ID = "00000000-0000-4000-8000-00000000000a";
const USER_ID = "user-1";
const USER_EMAIL = "user@example.com";
const INCLUDE = ["preview", "thumbnail"] as const;
const PAGE_SIZE = 50;

function makeItem(id: string, overrides: Partial<NotePageWindowItem> = {}): NotePageWindowItem {
  return {
    id,
    owner_id: USER_ID,
    note_id: NOTE_ID,
    source_page_id: null,
    title: `Title ${id}`,
    content_preview: `preview ${id}`,
    thumbnail_url: null,
    source_url: null,
    created_at: "2026-05-14T00:00:00Z",
    updated_at: "2026-05-14T00:00:00Z",
    is_deleted: false,
    ...overrides,
  };
}

/**
 * 1 window のみのキャッシュをセットアップしてクエリクライアントを返す。
 * Seed a single-window infinite cache for `noteId` and return the client.
 */
function seedCache(items: NotePageWindowItem[]): QueryClient {
  const client = new QueryClient();
  const data: InfiniteData<NotePageWindowResponse, string | null> = {
    pages: [{ items, next_cursor: null }],
    pageParams: [null],
  };
  client.setQueryData(noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE), data);
  return client;
}

function readCache(client: QueryClient): InfiniteData<NotePageWindowResponse, string | null> {
  const data = client.getQueryData<InfiniteData<NotePageWindowResponse, string | null>>(
    noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
  );
  if (!data) throw new Error("expected cached data");
  return data;
}

describe("applyNoteEventToCache", () => {
  it("prepends a new page on page.added without disturbing existing items", () => {
    const client = seedCache([makeItem("pg-1"), makeItem("pg-2")]);
    const newPage = makeItem("pg-new", { title: "Fresh" });

    const event: NoteEvent = { type: "page.added", note_id: NOTE_ID, page: newPage };
    applyNoteEventToCache(client, event);

    const data = readCache(client);
    expect(data.pages[0]?.items.map((i) => i.id)).toEqual(["pg-new", "pg-1", "pg-2"]);
    expect(data.pages[0]?.items[0]?.title).toBe("Fresh");
  });

  it("does not duplicate on page.added when the id already exists", () => {
    // mutation の onSuccess invalidate と SSE の page.added が両方走った場合、
    // 同じ id が 2 度 prepend されないことを担保する。
    // When the mutation's onSuccess invalidate races with the SSE event, we
    // must not prepend the same id twice.
    const existing = makeItem("pg-dup", { title: "Already there" });
    const client = seedCache([existing, makeItem("pg-other")]);

    const event: NoteEvent = {
      type: "page.added",
      note_id: NOTE_ID,
      page: makeItem("pg-dup", { title: "Echo" }),
    };
    applyNoteEventToCache(client, event);

    const data = readCache(client);
    const ids = data.pages[0]?.items.map((i) => i.id) ?? [];
    expect(ids).toEqual(["pg-dup", "pg-other"]);
    // 既存行は触らない（mutation onSuccess の invalidate と二重発火しても安全）。
    // The existing row is left untouched; safe under double-firing.
    expect(data.pages[0]?.items[0]?.title).toBe("Already there");
  });

  it("moves the updated row to the head of the first window on page.updated (remove + prepend)", () => {
    // PUT /content の metadata 更新は `updated_at` を bump するので、サーバ順
    // (`updated_at DESC, id DESC`) では更新ページが必ず先頭に来る。クライアント
    // でも同じ移動セマンティクスを再現する。coderabbitai major on PR #867。
    //
    // The server bumps `updated_at` on metadata edits, so the row must end
    // up at the head of the cached windows to match the server's
    // `updated_at DESC, id DESC` ordering (coderabbitai PR #867 major).
    const client = seedCache([
      makeItem("pg-1", { title: "Original 1" }),
      makeItem("pg-2", { title: "Original 2" }),
      makeItem("pg-3", { title: "Original 3" }),
    ]);

    const event: NoteEvent = {
      type: "page.updated",
      note_id: NOTE_ID,
      page: makeItem("pg-2", { title: "Updated 2", content_preview: "new preview" }),
    };
    applyNoteEventToCache(client, event);

    const data = readCache(client);
    // pg-2 が先頭へ移動し、pg-1 / pg-3 は元の相対順を保つ。
    // pg-2 jumps to the head; the others preserve their relative order.
    expect(data.pages[0]?.items.map((i) => i.id)).toEqual(["pg-2", "pg-1", "pg-3"]);
    expect(data.pages[0]?.items[0]?.title).toBe("Updated 2");
    expect(data.pages[0]?.items[0]?.content_preview).toBe("new preview");
  });

  it("inserts a previously-uncached row at the head on page.updated", () => {
    // ローカルキャッシュにない id でも、サーバが update を通知してきたら
    // 「最新行」として先頭に積む。次の natural refetch で前後関係は収束する。
    // If the id is not cached locally yet, treat the updated event as a
    // fresh "latest row" and prepend. The next natural refetch reconciles.
    const client = seedCache([makeItem("pg-1")]);
    const event: NoteEvent = {
      type: "page.updated",
      note_id: NOTE_ID,
      page: makeItem("pg-missing", { title: "Brand new" }),
    };
    applyNoteEventToCache(client, event);

    const data = readCache(client);
    expect(data.pages[0]?.items.map((i) => i.id)).toEqual(["pg-missing", "pg-1"]);
    expect(data.pages[0]?.items[0]?.title).toBe("Brand new");
  });

  it("moves a row across windows on page.updated when it lived in a later window", () => {
    // ページ id が後続 window に居ても削除 + 先頭 window への prepend を行う。
    // The row may live in any window; ensure it's stripped from the later
    // window and inserted at the head of the first one.
    const client = new QueryClient();
    const data: InfiniteData<NotePageWindowResponse, string | null> = {
      pages: [
        { items: [makeItem("pg-a")], next_cursor: "cursor-1" },
        { items: [makeItem("pg-b")], next_cursor: null },
      ],
      pageParams: [null, "cursor-1"],
    };
    client.setQueryData(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
      data,
    );

    applyNoteEventToCache(client, {
      type: "page.updated",
      note_id: NOTE_ID,
      page: makeItem("pg-b", { title: "Promoted" }),
    });

    const out = client.getQueryData<InfiniteData<NotePageWindowResponse, string | null>>(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
    );
    expect(out?.pages[0]?.items.map((i) => i.id)).toEqual(["pg-b", "pg-a"]);
    expect(out?.pages[1]?.items.map((i) => i.id)).toEqual([]);
  });

  it("removes the matching id on page.deleted", () => {
    const client = seedCache([makeItem("pg-1"), makeItem("pg-2"), makeItem("pg-3")]);

    const event: NoteEvent = { type: "page.deleted", note_id: NOTE_ID, page_id: "pg-2" };
    applyNoteEventToCache(client, event);

    const data = readCache(client);
    expect(data.pages[0]?.items.map((i) => i.id)).toEqual(["pg-1", "pg-3"]);
  });

  it("invalidates pages/details/members on note.permission_changed", () => {
    // `note.permission_changed` は権限の再評価を促すセンチネルなので、3 系列
    // を invalidate（fetchStatus が dirty 化）することを確認する。
    // The sentinel triggers re-evaluation of 3 cache families; we assert
    // that each one is marked stale (`invalidate`) after the dispatch.
    const client = seedCache([makeItem("pg-1")]);

    // 別途、members / detail 用のダミーキャッシュも種付けする。
    // Seed dummy entries for the members and detail caches too.
    client.setQueryData(noteKeys.memberList(NOTE_ID), [{ noteId: NOTE_ID }]);
    client.setQueryData(noteKeys.detail(NOTE_ID, USER_ID, USER_EMAIL), { id: NOTE_ID });

    const event: NoteEvent = { type: "note.permission_changed", note_id: NOTE_ID };
    applyNoteEventToCache(client, event);

    // `invalidateQueries` は該当キャッシュを stale にマークする。`isStale()`
    // で検証する。
    // `invalidateQueries` marks matching entries stale; check via `isStale()`.
    const windowState = client.getQueryState(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
    );
    const memberState = client.getQueryState(noteKeys.memberList(NOTE_ID));
    const detailState = client.getQueryState(noteKeys.detail(NOTE_ID, USER_ID, USER_EMAIL));
    expect(windowState?.isInvalidated).toBe(true);
    expect(memberState?.isInvalidated).toBe(true);
    expect(detailState?.isInvalidated).toBe(true);
  });

  it("patches every window variant for the same note (different include/pageSize)", () => {
    // useInfiniteNotePages は include と pageSize で別キーになる。`page.added`
    // のような prefix invalidate は両方に効く必要がある。
    // `useInfiniteNotePages` keys vary by include and pageSize. A prefix
    // patch must update every variant, not just one.
    //
    // coderabbitai minor on PR #867: 各キーには別 InfiniteData インスタンスを
    // 渡す。同一参照を共有するとインプレース変更バグを取り逃がしうるため。
    // coderabbitai minor on PR #867: seed each key with a distinct
    // InfiniteData object — sharing references can mask mutation bugs.
    const client = new QueryClient();
    const makeFreshData = (): InfiniteData<NotePageWindowResponse, string | null> => ({
      pages: [{ items: [makeItem("pg-1")], next_cursor: null }],
      pageParams: [null],
    });
    client.setQueryData(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, ["preview", "thumbnail"], 50),
      makeFreshData(),
    );
    client.setQueryData(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, ["preview"], 25),
      makeFreshData(),
    );

    applyNoteEventToCache(client, {
      type: "page.added",
      note_id: NOTE_ID,
      page: makeItem("pg-fresh"),
    });

    const a = client.getQueryData<InfiniteData<NotePageWindowResponse, string | null>>(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, ["preview", "thumbnail"], 50),
    );
    const b = client.getQueryData<InfiniteData<NotePageWindowResponse, string | null>>(
      noteKeys.pagesWindow(NOTE_ID, USER_ID, USER_EMAIL, ["preview"], 25),
    );
    expect(a?.pages[0]?.items.map((i) => i.id)).toEqual(["pg-fresh", "pg-1"]);
    expect(b?.pages[0]?.items.map((i) => i.id)).toEqual(["pg-fresh", "pg-1"]);
  });

  it("does not touch other notes' caches", () => {
    // 別 noteId のキャッシュは prefix が違うので影響を受けない。
    // Other notes have different prefix keys, so their caches stay intact.
    const otherNoteId = "00000000-0000-4000-8000-00000000000b";
    const client = new QueryClient();
    const data: InfiniteData<NotePageWindowResponse, string | null> = {
      pages: [{ items: [makeItem("pg-other-1")], next_cursor: null }],
      pageParams: [null],
    };
    client.setQueryData(
      noteKeys.pagesWindow(otherNoteId, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
      data,
    );

    applyNoteEventToCache(client, {
      type: "page.added",
      note_id: NOTE_ID,
      page: makeItem("pg-fresh"),
    });

    const other = client.getQueryData<InfiniteData<NotePageWindowResponse, string | null>>(
      noteKeys.pagesWindow(otherNoteId, USER_ID, USER_EMAIL, INCLUDE, PAGE_SIZE),
    );
    expect(other?.pages[0]?.items.map((i) => i.id)).toEqual(["pg-other-1"]);
  });
});
