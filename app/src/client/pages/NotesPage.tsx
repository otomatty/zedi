import { useContext, useEffect, useMemo, useRef } from "hono/jsx/dom";
import type { PageListItem, PageListResponse } from "../../shared/types";
import { fetchPageList } from "../api";
import { useInfiniteQuery } from "../lib/infiniteQuery";
import { QueryClientContext } from "../lib/query";
import { useVirtualizer } from "../lib/virtual";
import { pageOutbox, pendingPageDetail, syncPendingPages, usePendingPages } from "../offline";
import { router } from "../routing";

const ROW_HEIGHT = 72;
const PREFETCH_ROWS = 30;
const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

/**
 * Pages of a note from D1: keyset-paginated (100 per request) and virtualized; the next page
 * is fetched when the viewport gets close to the end of what is loaded.
 * D1 のページ一覧。100 件ずつのキーセット取得 + 仮想スクロールで、末尾に近づくと次を読む。
 */
export function NotesPage({ noteId }: { noteId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const client = useContext(QueryClientContext);
  const allPending = usePendingPages();
  const list = useInfiniteQuery<PageListResponse, string | null>({
    queryKey: ["pages", noteId],
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchPageList(noteId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  // Pages created on this device but not yet on the server are listed first.
  const pending = useMemo(
    () => allPending.filter((p) => p.noteId === noteId).map(pendingPageDetail),
    [allPending, noteId],
  );
  const pendingIds = useMemo(() => new Set(pending.map((p) => p.id)), [pending]);
  const items: (PageListItem & { pending?: boolean })[] = [
    ...pending.map((p) => ({ ...p, pending: true })),
    ...(list.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => !pendingIds.has(p.id)),
  ];
  const firstPage = list.data?.pages[0];
  const virtualizer = useVirtualizer({
    count: items.length + (list.hasNextPage ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? 0;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= items.length - PREFETCH_ROWS) {
      void fetchNextPage();
    }
  }, [lastIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (
      list.status === "success" &&
      performance.getEntriesByName("notes:first-render").length === 0
    ) {
      requestAnimationFrame(() => performance.mark("notes:first-render"));
    }
  }, [list.status]);

  // Creation always goes through the outbox (client-generated id), online or offline:
  // the editor opens at once and the page is sent now or when the connection is back.
  const create = () => {
    const time = new Intl.DateTimeFormat("ja-JP", { timeStyle: "medium" }).format(new Date());
    const id = crypto.randomUUID();
    pageOutbox.add({ id, noteId, title: `新しいページ ${time}`, createdAt: Date.now() });
    if (client) void syncPendingPages(client);
    router.navigate(`/notes/${id}`);
  };

  if (list.status === "pending") return <p class="muted">読み込み中…</p>;
  if (list.status === "error") return <p role="alert">読み込みに失敗しました。</p>;

  return (
    <section class="notes">
      <header class="notes-header">
        <h1>
          ノート一覧{" "}
          <span class="muted">
            {((firstPage?.total ?? 0) + pending.length).toLocaleString()} 件
          </span>
        </h1>
        {firstPage && firstPage.role !== "viewer" && (
          <button type="button" class="primary-button" onClick={create} data-testid="new-page">
            新規ページ
          </button>
        )}
      </header>
      <div ref={scrollRef} class="note-scroll" data-testid="note-scroll">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualItems.map((row) => {
            const page = items[row.index];
            if (!page) {
              return (
                <div
                  key="loader"
                  class="note-row muted"
                  style={{ transform: `translateY(${row.start}px)`, height: `${ROW_HEIGHT}px` }}
                >
                  読み込み中…
                </div>
              );
            }
            return (
              <a
                key={page.id}
                href={`/notes/${page.id}`}
                class="note-row"
                style={{ transform: `translateY(${row.start}px)`, height: `${ROW_HEIGHT}px` }}
              >
                <span class="note-title">
                  {page.title}
                  {page.pending && <span class="badge">未同期</span>}
                </span>
                <span class="note-meta">
                  {page.preview || "（本文なし）"} ・ {dateFormat.format(new Date(page.updatedAt))}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
