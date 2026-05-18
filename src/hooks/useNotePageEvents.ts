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
import { noteKeys, type NotePageTitle } from "@/hooks/useNoteQueries";

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
 * 指定 id を `NotePageWindowItem` 配列から取り除く。`removed` フラグで
 * 実際に該当行があったかを呼び出し側へ伝える（無変更時はキャッシュエントリ
 * 自体を再構築しないための判定に使う）。
 *
 * Strip the entry with `id` from the items array. `removed` lets the caller
 * skip recreating the cache entry when nothing changed (avoids spurious
 * React Query notifications).
 */
function removeIdFromItems(
  items: NotePageWindowItem[],
  id: string,
): { items: NotePageWindowItem[]; removed: boolean } {
  const next = items.filter((item) => item.id !== id);
  return { items: next, removed: next.length !== items.length };
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
 * `useNoteTitleIndex` 用の `setQueriesData` ヘルパ（issue #860 Phase 6）。
 * window キャッシュと同じく、認証プリンシパルごとに分かれている title-index
 * キャッシュ全部に対して transform を流す。
 *
 * `setQueriesData` helper for the title-index cache (issue #860 Phase 6).
 * Walks every cached `titleIndex` query for the given note (one entry per
 * auth principal) and applies the transform.
 */
function updateAllTitleIndexesForNote(
  queryClient: ReturnType<typeof useQueryClient>,
  noteId: string,
  transform: (data: NotePageTitle[]) => NotePageTitle[],
): void {
  queryClient.setQueriesData<NotePageTitle[]>(
    { queryKey: noteKeys.titleIndexByNoteId(noteId) },
    (data) => {
      if (!data) return data;
      return transform(data);
    },
  );
}

/**
 * `NotePageWindowItem` を `NotePageTitle` に縮約する。SSE で受け取る
 * `page.added` / `page.updated` の payload から、title-index 用の最小行を
 * 切り出すために使う。
 *
 * Project a `NotePageWindowItem` (full SSE payload) down to the
 * `NotePageTitle` shape consumed by `useNoteTitleIndex`. Used to splice
 * `page.added` / `page.updated` events into the title-index cache.
 */
function windowItemToTitle(item: NotePageWindowItem): NotePageTitle {
  // updated_at は SSE 経路でも snake_case の ISO 文字列。`Date.parse` 互換。
  // The SSE wire shape carries `updated_at` as an ISO string; parse to ms.
  const ts = Date.parse(item.updated_at);
  return {
    id: item.id,
    title: item.title ?? "",
    isDeleted: item.is_deleted,
    updatedAt: Number.isNaN(ts) ? 0 : ts,
  };
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
      // issue #860 Phase 6: title-index キャッシュにも同じ append を反映する。
      // wiki link / AI chat scope などが「今追加されたページ」を即座に解決
      // できるようにするため、全ページ refetch を待たずに patch する。
      //
      // Issue #860 Phase 6: mirror the prepend in the title-index cache so
      // wiki-link resolution and AI-chat scope sync see the new title
      // immediately, without waiting for a full title-index refetch.
      updateAllTitleIndexesForNote(queryClient, event.note_id, (data) => {
        if (data.some((it) => it.id === event.page.id)) return data;
        return [windowItemToTitle(event.page), ...data];
      });
      return;
    }
    case "page.updated": {
      // PUT /content の metadata 更新は `updated_at` を bump するので、
      // サーバ順 (`updated_at DESC, id DESC`) では更新ページが必ず先頭に来る。
      // クライアントキャッシュも同様に「現在いる window から取り除いて先頭
      // window に prepend」する remove+prepend セマンティクスで合わせる。
      // 再ソートはしない (Phase 3 の「サーバ順を信頼する」要件)。
      // coderabbitai review on PR #867 major: in-place 置換だと旧 window に
      // 取り残されてしまうため移動が必要。
      //
      // `page.updated` bumps `updated_at`, which puts the row at the head
      // of the server's `updated_at DESC, id DESC` ordering. Apply the same
      // shift to the cached windows by removing the row wherever it lives
      // and prepending the fresh copy to the first window. We do not
      // re-sort anything else (Phase 3 invariant); the next natural
      // refetch reconciles any cross-window drift. Fixes coderabbitai
      // major on PR #867 — replace-in-place left the row stranded in its
      // old window.
      updateAllWindowsForNote(queryClient, event.note_id, (data) => {
        const first = data.pages[0];
        if (!first) return data;

        let anyChanged = false;
        const stripped = data.pages.map((page) => {
          const { items, removed } = removeIdFromItems(page.items, event.page.id);
          if (!removed) return page;
          anyChanged = true;
          return { items, next_cursor: page.next_cursor };
        });

        const head = stripped[0];
        if (!head) return data;

        // 重複防止: 既に先頭 window に新しい event.page と同じ id があれば
        // 何もしない（同一フレーム内で page.added → page.updated が連続する
        // ような並びでの重複防止）。`stripped` で既に取り除いているので、
        // 通常はこの分岐に入らないが、データ不整合への防御として残す。
        // Defensive dedupe: even after stripping, if the first window
        // already contains the id (e.g. another concurrent event), skip
        // the prepend to avoid duplicates.
        if (head.items.some((it) => it.id === event.page.id)) {
          return anyChanged ? { ...data, pages: stripped } : data;
        }

        const nextFirst: NotePageWindowResponse = {
          items: [event.page, ...head.items],
          next_cursor: head.next_cursor,
        };
        return {
          ...data,
          pages: [nextFirst, ...stripped.slice(1)],
        };
      });
      // issue #860 Phase 6: title-index も同じ remove + prepend で move-to-head。
      // タイトル変更が含まれる場合（リネーム）にも反映されるため、wiki link
      // 解決の即時性が保たれる。
      //
      // Issue #860 Phase 6: apply the same remove + prepend semantics to the
      // title-index cache, so a rename surfaces in wiki-link resolution
      // without waiting for the next refetch.
      updateAllTitleIndexesForNote(queryClient, event.note_id, (data) => {
        const next = windowItemToTitle(event.page);
        const stripped = data.filter((it) => it.id !== next.id);
        return [next, ...stripped];
      });
      return;
    }
    case "page.deleted": {
      updateAllWindowsForNote(queryClient, event.note_id, (data) => {
        let anyChanged = false;
        const nextPages = data.pages.map((page) => {
          const { items, removed } = removeIdFromItems(page.items, event.page_id);
          if (!removed) return page;
          anyChanged = true;
          return { items, next_cursor: page.next_cursor };
        });
        if (!anyChanged) return data;
        return { ...data, pages: nextPages };
      });
      // issue #860 Phase 6: title-index からも該当 id を取り除く。wiki link
      // が削除済みページに解決され続けないようにするためのキャッシュ整合。
      //
      // Issue #860 Phase 6: drop the deleted id from the title-index cache
      // so wiki-link resolution stops matching the tombstoned page until a
      // refetch happens.
      updateAllTitleIndexesForNote(queryClient, event.note_id, (data) => {
        const next = data.filter((it) => it.id !== event.page_id);
        return next.length === data.length ? data : next;
      });
      return;
    }
    case "note.permission_changed": {
      // 権限の変化は `getNoteRole` の結果を変えるため、details / window /
      // title-index / members の 4 系列を invalidate して次レンダリングで
      // 再評価させる（Phase 6 で title-index 系列を追加）。
      // Permission changes flip `getNoteRole`, so invalidate the four
      // related caches and let the next render fetch fresh values. Phase 6
      // added the title-index cache to this list since its ETag is
      // role-aware too.
      queryClient.invalidateQueries({
        queryKey: noteKeys.detailsByNoteId(event.note_id),
      });
      queryClient.invalidateQueries({
        queryKey: noteKeys.pagesWindowByNoteId(event.note_id),
      });
      queryClient.invalidateQueries({
        queryKey: noteKeys.titleIndexByNoteId(event.note_id),
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
      // SSE のイベント名 `name` を信頼の単一源とする。サーバ payload の
      // `type` を後から上書きされないよう、`...parsed` を先に展開して `type`
      // を後置きで固定する (coderabbitai minor on PR #867)。
      // Make the wire SSE event name authoritative. Spreading `parsed`
      // first and clamping `type: name` afterwards prevents a malformed
      // payload from overriding the discriminator that the
      // `addEventListener` wiring already validated (coderabbitai minor
      // on PR #867).
      const event = { ...parsed, type: name } as NoteEvent;
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

    // 接続を作るたびに detach / close を覚えておくセル。`note.permission_changed`
    // で即時 rotate するため、useEffect cleanup と中身の reconnect の両方から
    // 同じハンドルを操作する。
    // Cell holding the current connection so both the useEffect cleanup
    // and the in-callback rotation on `note.permission_changed` can close
    // and replace the active EventSource via a single owner.
    let currentEs: EventSource | null = null;
    let currentDetach: (() => void) | null = null;

    const open = () => {
      // EventSource は cookie ベース認証で動くため `withCredentials: true` を
      // 渡す。same-origin 構成（VITE_API_BASE_URL が空）でも明示しておく。
      // EventSource needs `withCredentials: true` so the cookie-based auth
      // travels with the request. Explicit even on same-origin builds.
      const es = new EventSource(url, { withCredentials: true });
      currentEs = es;

      currentDetach = attachNoteEventListeners(
        es,
        () => {
          // 毎回の `ready` で window と title-index キャッシュを 1 度ずつ
          // invalidate する。初回 ready は `useInfiniteNotePages` /
          // `useNoteTitleIndex` のクエリ完了から SSE subscribe が live に
          // なるまでの T0→subscribe ギャップを補修し、再接続時の ready は
          // 切断中の取りこぼしを補修する (Codex P2 / coderabbitai PR #867、
          // Phase 6 で title-index も対象化)。サーバが ready 送信前に
          // subscribe するため、ready 後に来る event は失われない。
          //
          // Invalidate both the pages window and title-index caches on
          // every `ready`. The first ready covers the T0→subscribe race
          // between the initial REST fetches and the SSE subscription
          // becoming live; subsequent readys (reconnects) cover the
          // disconnect gap. Phase 6 extended this to include the
          // title-index cache since wiki-link consumers can lose events
          // during the same window.
          queryClient.invalidateQueries({
            queryKey: noteKeys.pagesWindowByNoteId(noteId),
          });
          queryClient.invalidateQueries({
            queryKey: noteKeys.titleIndexByNoteId(noteId),
          });
        },
        (event) => {
          applyNoteEventToCache(queryClient, event);
          // Issue #860 Phase 4: 権限変化を検知したら EventSource をその場で
          // 閉じて張り直す。サーバ側も `note.permission_changed` を書き出した
          // 後にストリームを閉じるが、`retry: 30000` の auto-reconnect 待ち
          // が走る前にクライアント側で即時再接続することで、新権限の
          // 再評価とフィード回復のレイテンシを最小化する
          // (Codex P1 / coderabbitai critical on PR #867)。
          //
          // Client-side rotation on permission change: the server closes
          // the stream after delivering this event, but EventSource would
          // otherwise wait `retry: 30000` ms before reconnecting. Closing
          // and re-opening here makes the re-auth round trip happen
          // immediately.
          if (event.type === "note.permission_changed") {
            currentDetach?.();
            es.close();
            currentEs = null;
            currentDetach = null;
            open();
          }
        },
      );

      // `onerror` は EventSource の自動再接続が走る前にも呼ばれる。ログするだけ
      // にして接続維持はブラウザに任せる（自動再接続が走らないようにしたい場合
      // は close を呼ぶが、ここでは保守的に何もしない）。
      // `onerror` fires before EventSource's built-in reconnect; just log so
      // the browser's reconnect path runs unimpeded.
      es.onerror = (ev) => {
        console.warn("[useNotePageEvents] EventSource error", ev);
      };
    };

    open();

    return () => {
      currentDetach?.();
      currentEs?.close();
      currentEs = null;
      currentDetach = null;
    };
  }, [noteId, enabled, queryClient]);
}
