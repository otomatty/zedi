import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAuth } from "@/hooks/useAuth";
import { useContainerColumns } from "@/hooks/useContainerColumns";
import { usePagesSummary, useSyncStatus } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";
import PageCard from "./PageCard";
import EmptyState from "./EmptyState";
import { cn, Skeleton } from "@zedi/ui";
import { hasNeverSynced } from "@/lib/sync";
import type { PageSummary } from "@/types/page";

const skeletonItems = Array.from({ length: 20 }, (_, index) => index);

const gridColsClass: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/**
 * カード 1 枚 + grid gap-3 (12px) 込みの推定高さ。aspect-square の正方形カードと
 * 縦方向の gap を含むため、列数によらず 1 行あたりの高さはほぼ一定。実測値が
 * 取れた行は `measureElement` 経由で動的に補正される。
 *
 * Estimated row height (square card + 12px vertical gap). The virtualizer
 * refines this per row via `measureElement` once each row is laid out.
 */
const ESTIMATED_ROW_HEIGHT = 220;

/**
 * 親要素を辿って overflow-y が auto/scroll の最初の祖先を返す。
 * `PageGrid` の親が `ContentWithAIChat` 内の overflow-y-auto コンテナなので、
 * スクロールコンテナを自分で持たずに既存レイアウトに同調する。
 *
 * `getComputedStyle` をループで呼ぶため理論的にはレイアウトスラッシュの懸念が
 * あるが、本関数は `useLayoutEffect` から mount 時に 1 回だけ実行される。
 * 祖先深さもページ全体で 5〜10 階層に収まるため、実用上のコストは無視できる
 * （PR #856 Gemini medium review に対する acknowledged comment）。
 *
 * Walk up the DOM to find the nearest ancestor whose `overflow-y` is
 * `auto` or `scroll`. Falls back to `null` (which the virtualizer treats as
 * window-less, i.e. it will skip measurement until a scroll element appears).
 *
 * Calling `getComputedStyle` in a loop could in principle cause layout
 * thrashing, but this runs exactly once from `useLayoutEffect` on mount and
 * the ancestor chain in this app is shallow (~5-10 nodes), so the cost is
 * negligible in practice. Documented in response to PR #856 Gemini medium
 * review.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** スケルトン表示。列数は親の PageGrid で計測した columns を渡す（表示の一貫性のため） */
const PageGridSkeleton: React.FC<{ columns: 2 | 3 | 4 | 5 | 6 }> = ({ columns }) => (
  <div className={cn("grid gap-3", gridColsClass[columns])}>
    {skeletonItems.map((index) => (
      <div
        key={`page-skeleton-${index}`}
        className="page-card border-border/50 bg-card flex aspect-square w-full flex-col overflow-hidden rounded-lg border"
      >
        <div className="p-3 pb-2">
          <div className="flex items-start gap-1.5">
            <Skeleton className="h-4 w-4" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-3 pb-3">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    ))}
  </div>
);

interface PageGridProps {
  isSeeding?: boolean;
  /**
   * ノート文脈で表示する場合に対象のノート ID を渡す。データソースが
   * `useNotePages(noteId)` に切り替わり、各カードの遷移先・削除導線も
   * `/notes/:noteId/:pageId` 経由になる。未指定時は従来通り個人ページ集合
   * (`usePagesSummary`) を表示する。
   *
   * Render the grid in a note context. Switches the data source to
   * `useNotePages(noteId)` and routes each card's navigation/delete through
   * the note-scoped endpoints. Without it the grid behaves as the legacy
   * personal-pages grid backed by `usePagesSummary`.
   */
  noteId?: string;
  /**
   * ノート文脈で削除メニューを許可するか。`useNote` の access から導出した
   * `canEdit` を渡す想定。`noteId` 未指定時は無視される（個人ページは常に
   * 削除可能）。
   *
   * Whether the per-card delete action is enabled in a note context. Callers
   * pass the note's `canEdit` flag. Ignored when `noteId` is not set, since
   * personal pages are always deletable by their owner.
   */
  canEdit?: boolean;
  /**
   * ページごとに削除可否を判定する関数。ノート文脈で「オーナーは全削除可・
   * エディターは自分が追加したページのみ」のような細かい制御を復元するための
   * フック。渡されない場合は `canEdit`（ノート文脈）または常に true（個人）が
   * 適用される。サーバ側 `canEdit` ガードと併走する UX 向けのフィルタで、
   * 実際の権限判定は API が行う。
   *
   * Per-page delete guard. Restores the granular rule used by the previous
   * `NoteViewPageGrid` (owners may delete any page, editors only the ones
   * they added). When omitted the grid falls back to the coarse `canEdit`
   * boolean (note) or always-true (personal). This is a UX-side filter; the
   * server's `canEdit` guard remains the source of truth.
   */
  canDeletePage?: (page: PageSummary) => boolean;
}

/**
 * Recent-pages grid. Shows a skeleton while the initial data is loading
 * (including first-time sign-in syncs), an empty state when there are no
 * pages, and the populated grid otherwise. When `noteId` is supplied the grid
 * is sourced from `useNotePages` and behaves as the note's page list (replaces
 * the previous note-specific grid).
 *
 * ページグリッド。ロード中はスケルトン、空時は空状態、それ以外はグリッドの
 * 3 状態構成。`noteId` を渡すとノート配下のページ一覧として動作する
 * （旧 `NoteViewPageGrid` の置き換え）。
 *
 * 大量ページ時の描画コストを定数化するため、`@tanstack/react-virtual` で
 * 行単位の windowing を行う（Issue #852）。スクロールコンテナは祖先を辿って
 * 見つけ、`ContentWithAIChat` 内の `overflow-y-auto` をそのまま使う。
 *
 * Uses `@tanstack/react-virtual` to window the grid by row so the rendered
 * DOM stays roughly constant regardless of page count (Issue #852). The
 * scroll container is resolved by walking up the DOM, reusing the existing
 * `overflow-y-auto` inside `ContentWithAIChat`.
 */
const PageGrid: React.FC<PageGridProps> = ({
  isSeeding = false,
  noteId,
  canEdit = true,
  canDeletePage,
}) => {
  const { ref: containerRef, columns } = useContainerColumns();
  const isNoteContext = Boolean(noteId);

  // 個人ページ用のデータ取得。ノート文脈では呼ばないが、React Hooks の
  // ルール上常時呼ぶ必要があるので、`enabled` で抑制する代わりに結果を捨てる。
  // Personal pages source. Always invoked to satisfy hook rules, but ignored
  // when a `noteId` is provided.
  const personalQuery = usePagesSummary({ enabled: !isNoteContext });
  const noteQuery = useNotePages(noteId ?? "", undefined, isNoteContext);

  const pages: PageSummary[] = isNoteContext
    ? ((noteQuery.data ?? []) as PageSummary[])
    : (personalQuery.data ?? []);
  const isLoading = isNoteContext ? noteQuery.isLoading : personalQuery.isLoading;

  const syncStatus = useSyncStatus();
  const { isSignedIn } = useAuth();

  const sortedPages = useMemo(() => {
    return [...pages].filter((p) => !p.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [pages]);

  // 同期スケルトンは個人ページ向けの初回同期インジケータなのでノート文脈では出さない。
  // The sync-driven skeleton is a personal-pages first-sync indicator and is
  // suppressed in a note context.
  const isInitialSyncPending =
    !isNoteContext && isSignedIn && hasNeverSynced() && syncStatus !== "error";
  const hasPages = sortedPages.length > 0;
  const shouldShowSkeleton =
    !hasPages &&
    (isLoading ||
      (!isNoteContext && (syncStatus === "syncing" || isInitialSyncPending)) ||
      isSeeding);

  const defaultDeletePermission = isNoteContext ? canEdit : true;

  // ─── Virtualization ────────────────────────────────────────────────
  // `useContainerColumns` の ref は wrapper に付与し、スクロールコンテナは
  // 祖先を辿って取得する。`scrollParent` は state で保持し、`useVirtualizer`
  // の `getScrollElement` から参照されるたびに最新値を返す。
  // The container ref drives column measurement; the scroll parent is
  // discovered by walking up the DOM after mount and held in state so the
  // virtualizer's `getScrollElement` always returns the latest value.
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setScrollParent(findScrollParent(containerRef.current));
  }, [containerRef]);

  const rowCount = hasPages ? Math.ceil(sortedPages.length / columns) : 0;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollParent,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 4,
  });

  // 列数が変わったら高さを再計測し直す（カードのアスペクト比は維持されるが、
  // 1 行に並ぶカード数とそれに伴う行高が変わるため）。
  // Recompute virtualized row heights when the column count changes.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [columns, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div ref={containerRef} className="pb-24">
      {shouldShowSkeleton && <PageGridSkeleton columns={columns} />}
      {!shouldShowSkeleton && sortedPages.length === 0 && <EmptyState noteId={noteId} />}
      {!shouldShowSkeleton && sortedPages.length > 0 && (
        <div className="relative w-full" style={{ height: totalHeight }}>
          {virtualRows.map((row) => {
            const start = row.index * columns;
            const items = sortedPages.slice(start, start + columns);
            return (
              <div
                key={row.key}
                // `useVirtualizer` の `measureElement` は既定で `data-index`
                // 属性を読んで仮想行と DOM 要素を紐付ける。属性名を変えると
                // 動的計測が機能せず ESTIMATED_ROW_HEIGHT に固定されるので
                // 必ず `data-index` のまま渡す (PR #856 Codex P2 review)。
                //
                // `measureElement` looks up the virtual row via the
                // `data-index` attribute by default; renaming the attribute
                // breaks dynamic measurement and pins the virtualizer to
                // `ESTIMATED_ROW_HEIGHT` (see PR #856 Codex P2 review).
                data-index={row.index}
                ref={rowVirtualizer.measureElement}
                className={cn(
                  "absolute top-0 left-0 grid w-full gap-3 pb-3",
                  gridColsClass[columns],
                )}
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {items.map((page: PageSummary, i: number) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    index={start + i}
                    noteId={noteId}
                    canDelete={canDeletePage ? canDeletePage(page) : defaultDeletePermission}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PageGrid;
