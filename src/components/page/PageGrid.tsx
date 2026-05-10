import React, { useMemo } from "react";
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
 */
const PageGrid: React.FC<PageGridProps> = ({
  isSeeding = false,
  noteId,
  canEdit = true,
  canDeletePage,
}) => {
  const { ref, columns } = useContainerColumns();
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

  return (
    <div ref={ref} className="pb-24">
      {shouldShowSkeleton && <PageGridSkeleton columns={columns} />}
      {!shouldShowSkeleton && sortedPages.length === 0 && <EmptyState noteId={noteId} />}
      {!shouldShowSkeleton && sortedPages.length > 0 && (
        <div className={cn("grid gap-3", gridColsClass[columns])}>
          {sortedPages.map((page: PageSummary, index: number) => (
            <PageCard
              key={page.id}
              page={page}
              index={index}
              noteId={noteId}
              canDelete={canDeletePage ? canDeletePage(page) : defaultDeletePermission}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PageGrid;
