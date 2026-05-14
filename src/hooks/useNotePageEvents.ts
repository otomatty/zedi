/**
 * `useNotePageEvents` — `/api/notes/:noteId/events` SSE フィードを購読し、
 * `useInfiniteNotePages` の React Query infinite cache を差分パッチするフック
 * (Issue #860 Phase 4)。
 *
 * Subscribes to the note-scoped SSE feed and applies received events to the
 * `useInfiniteNotePages` cache in place via `queryClient.setQueriesData`, so
 * page mutations elsewhere (other tabs, other clients) propagate without a
 * full window refetch. Reconnects via `EventSource`'s built-in `retry`, and
 * after every successful (re)connect runs a single
 * `invalidateQueries(noteKeys.pagesWindowByNoteId)` to recover anything that
 * mutated during the gap. Falls back gracefully when `EventSource` is not
 * defined (e.g. SSR / test environments without polyfill).
 *
 * @see ../lib/api/noteEvents.ts
 * @see ./useNoteQueries.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import { useEffect } from "react";
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import type { NotePageWindowItem, NotePageWindowResponse } from "@/lib/api/types";
import type { NoteEvent } from "@/lib/api/noteEvents";
import { noteKeys } from "@/hooks/useNoteQueries";

/**
 * `useNotePageEvents` の実行オプション。
 *
 * Runtime options for {@link useNotePageEvents}.
 */
export interface UseNotePageEventsOptions {
  /**
   * 購読の有効化フラグ。`PageGrid` のように note 画面が開いている間だけ接続
   * したい呼び出し側で `false` を渡してマウント中の SSE 接続を抑制する。
   *
   * Gate to enable the subscription. Pass `false` to suppress the SSE
   * connection without unmounting the hook (e.g. when the note grid is
   * hidden behind a tab).
   */
  enabled?: boolean;
}

/**
 * 同一 noteId かつ wire shape 同一の `NotePageWindowItem` 配列内で id が
 * 一致する行を最新ペイロードで置換する。順序は維持する（Phase 3 の「サーバ順
 * を信頼する」要件に従う）。
 *
 * Replace the page row with matching id, keeping the array order intact.
 * Phase 3 requires the client trust the server's `updated_at DESC, id DESC`
 * ordering, so we do not re-sort here even if `updated_at` changes — the
 * next natural refetch reconciles drift.
 */
function replacePageInItems(
  items: NotePageWindowItem[],
  next: NotePageWindowItem,
): { items: NotePageWindowItem[]; changed: boolean } {
  let changed = false;
  const updated = items.map((item) => {
    if (item.id === next.id) {
      changed = true;
      return next;
    }
    return item;
  });
  return { items: updated, changed };
}

/**
 * `setQueriesData` ヘルパ: 指定 noteId に紐づく `pagesWindow` の各キャッシュを
 * 走査し、コールバックで新しい `InfiniteData<NotePageWindowResponse>` を返す。
 *
 * Walk every cached `pagesWindow` query for the given note and let the
 * callback produce a fresh `InfiniteData<NotePageWindowResponse>`. Returning
 * the same data reference is fine; React Query skips notifying observers
 * when reference equality holds.
 */
function updateAllWindowsForNote(
  queryClient: ReturnType<typeof useQueryClient>,
  noteId: string,
  transform: (
    data: InfiniteData<NotePageWindowResponse, string | null>,
  ) => InfiniteData<NotePageWindowResponse, string | null>,
): void {
  queryClient.setQueriesData<InfiniteData<NotePageWindowResponse, string | null>>(
    { queryKey: noteKeys.pagesWindowByNoteId(noteId) },
    (data) => {
      if (!data) return data;
      return transform(data);
    },
  );
}

/**
 * SSE で受け取った `NoteEvent` を `queryClient` のキャッシュへ適用する。
 *
 * Apply a received {@link NoteEvent} to the React Query cache. Pure dispatch
 * over the discriminated union — kept top-level so the hook body stays
 * small and unit tests can drive it directly.
 */
export function applyNoteEventToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  event: NoteEvent,
): void {
  switch (event.type) {
    case "page.added": {
      // 新規ページは window 全体で最新の `updated_at` を持つはず。最初の
      // window の items 先頭へ prepend し、重複（同一 id）がある場合は
      // 何もしない（mutation の onSuccess invalidate と被るケース）。
      // The new page must have the highest `updated_at`, so prepend it to
      // the first window. Skip when an item with the same id already exists
      // to avoid duplicates after the mutation's `invalidateQueries`
      // settles concurrently.
      updateAllWindowsForNote(queryClient, event.note_id, (data) => {
        const first = data.pages[0];
        if (!first) return data;
        if (first.items.some((it) => it.id === event.page.id)) {
          return data;
        }
        const nextFirst: NotePageWindowResponse = {
          items: [event.page, ...first.items],
          next_cursor: first.next_cursor,
        };
        return {
          ...data,
          pages: [nextFirst, ...data.pages.slice(1)],
        };
      });
      return;
    }
    case "page.updated": {
      // どの window に該当行が居るか分からないので全 window を走査して
      // 一致 id を置換する。Phase 3 のサーバ順を尊重するため再 sort はしない。
      // The updated page can live in any window, so scan all of them and
      // replace by id. We honour Phase 3's "trust server order" invariant
      // and do not re-sort even if `updated_at` shifts.
      updateAllWindowsForNote(queryClient, event.note_id, (data) => {
        let anyChanged = false;
        const nextPages = data.pages.map((page) => {
          const { items, changed } = replacePageInItems(page.items, event.page);
          if (changed) anyChanged = true;
          return changed ? { items, next_cursor: page.next_cursor } : page;
        });
        if (!anyChanged) return data;
        return { ...data, pages: nextPages };
      });
      return;
    }
    case "page.deleted": {
      updateAllWindowsForNote(queryClient, event.note_id, (data) => {
        let anyChanged = false;
        const nextPages = data.pages.map((page) => {
          const filtered = page.items.filter((it) => it.id !== event.page_id);
          if (filtered.length === page.items.length) return page;
          anyChanged = true;
          return { items: filtered, next_cursor: page.next_cursor };
        });
        if (!anyChanged) return data;
        return { ...data, pages: nextPages };
      });
      return;
    }
    case "note.permission_changed": {
      // 権限の変化は `getNoteRole` の結果を変えるため、details / window /
      // members の 3 系列を invalidate して次レンダリングで再評価させる。
      // Permission changes flip `getNoteRole`, so invalidate the three
      // related caches and let the next render fetch fresh values.
      queryClient.invalidateQueries({
        queryKey: noteKeys.detailsByNoteId(event.note_id),
      });
      queryClient.invalidateQueries({
        queryKey: noteKeys.pagesWindowByNoteId(event.note_id),
      });
      queryClient.invalidateQueries({
        queryKey: noteKeys.memberList(event.note_id),
      });
      return;
    }
  }
}

/**
 * 安全に JSON.parse する。失敗時は null を返してログに残す。
 * Safely parse a JSON payload; logs and returns null on failure so a
 * malformed frame from the server does not crash the React tree.
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[useNotePageEvents] failed to parse event payload:", err);
    return null;
  }
}

/**
 * `EventSource` のインスタンスにイベントハンドラを束ねるユーティリティ。
 * `EventSource` ハンドラはイベント名ごとに `addEventListener` で登録するため、
 * unmount で確実にすべて剥がせるよう登録の戻りを集めて返す。
 *
 * Attach typed listeners to an `EventSource`. Each SSE event name (`ready`,
 * `page.added`, …) has its own listener registered via `addEventListener`,
 * so we collect detach callbacks and run them on cleanup to avoid leaks.
 */
function attachNoteEventListeners(
  es: EventSource,
  onReady: () => void,
  onEvent: (event: NoteEvent) => void,
): () => void {
  const detachers: Array<() => void> = [];

  const wrap = (name: string, handler: (msg: MessageEvent<string>) => void) => {
    es.addEventListener(name, handler as EventListener);
    detachers.push(() => es.removeEventListener(name, handler as EventListener));
  };

  wrap("ready", () => {
    onReady();
  });
  for (const name of ["page.added", "page.updated", "page.deleted", "note.permission_changed"]) {
    wrap(name, (msg) => {
      const parsed = tryParseJson(msg.data) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") return;
      // ペイロードに `type` が無くてもイベント名から復元する（サーバ側で
      // 落ちている / 未来のリプレイ機構との互換のため）。
      // Some senders may omit `type` in the body since it duplicates the
      // SSE event name; restore it so the union narrows correctly.
      const event = { type: name, ...parsed } as NoteEvent;
      onEvent(event);
    });
  }

  return () => {
    for (const d of detachers) d();
  };
}

/**
 * Returns the base URL configured for the API. Mirrors the resolution used by
 * `createApiClient` so the SSE endpoint and the REST endpoints stay in sync.
 *
 * `createApiClient` と同じ手順で API のベース URL を解決する。SSE エンドポイント
 * と REST エンドポイントの解決パスを揃える。
 */
function resolveApiBaseUrl(): string {
  // import.meta.env は Vite 経由でビルド時にインライン化される。
  // `import.meta.env` is inlined by Vite at build time.
  const env = (import.meta as ImportMeta).env as Record<string, string | undefined> | undefined;
  return env?.VITE_API_BASE_URL ?? "";
}

/**
 * ノート画面マウント中だけ `/api/notes/:noteId/events` を購読する hook。
 * 受信イベントは React Query キャッシュへ差分適用するため、`PageGrid` 側で
 * 追加の `invalidateQueries` 呼び出しは不要（mutation の `onSuccess` invalidate
 * は SSE 未接続時のフォールバックとして残す）。
 *
 * Subscribes to the note-scoped SSE feed while the consuming component is
 * mounted. Received events patch the React Query cache so the grid updates
 * without a fresh refetch. `PageGrid` does not need to invalidate manually;
 * existing mutation `onSuccess` invalidations remain as a fallback for
 * environments where the SSE connection hasn't established yet.
 */
export function useNotePageEvents(noteId: string, options: UseNotePageEventsOptions = {}): void {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !noteId) return;
    if (typeof EventSource === "undefined") return;

    const base = resolveApiBaseUrl();
    const url = `${base}/api/notes/${encodeURIComponent(noteId)}/events`;

    // EventSource は cookie ベース認証で動くため `withCredentials: true` を
    // 渡す。same-origin 構成（VITE_API_BASE_URL が空）でも明示しておく。
    // EventSource needs `withCredentials: true` so the cookie-based auth
    // travels with the request. Explicit even on same-origin builds.
    const es = new EventSource(url, { withCredentials: true });

    let isFirstReady = true;
    const detach = attachNoteEventListeners(
      es,
      () => {
        // 初回 `ready` ではキャッシュをそのまま使う。2 回目以降（再接続）は
        // 切断中の取りこぼし補修として 1 度だけ invalidate する。
        // First `ready` is just the hello; subsequent ones mean we reconnected
        // and should invalidate once to pick up anything missed during the gap.
        if (isFirstReady) {
          isFirstReady = false;
          return;
        }
        queryClient.invalidateQueries({
          queryKey: noteKeys.pagesWindowByNoteId(noteId),
        });
      },
      (event) => {
        applyNoteEventToCache(queryClient, event);
      },
    );

    // `onerror` は EventSource の自動再接続が走る前にも呼ばれる。ログするだけ
    // にして接続維持はブラウザに任せ、ユーザー操作で recover させる。
    // `onerror` fires before EventSource's built-in reconnect; just log so
    // we don't double-handle the recovery the browser will do for us.
    es.onerror = (ev) => {
      console.warn("[useNotePageEvents] EventSource error", ev);
    };

    return () => {
      detach();
      es.close();
    };
  }, [noteId, enabled, queryClient]);
}
