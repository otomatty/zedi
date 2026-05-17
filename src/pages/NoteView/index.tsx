import React, { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteShareUrlCopyButton } from "@/components/note/NoteShareUrlCopyButton";
import { NoteTitleSwitcher } from "@/components/note/NoteTitleSwitcher";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Badge } from "@zedi/ui";
import { NoteAddPageDialog } from "./NoteAddPageDialog";
import { useNote } from "@/hooks/useNoteQueries";
import { useTranslation } from "react-i18next";
import { getNoteViewPermissions } from "./noteViewHelpers";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import PageGrid from "@/components/page/PageGrid";
import { TagFilterBar } from "@/components/tagFilterBar";
import { useNoteTagAggregation } from "@/hooks/useNoteTagAggregation";
import { useTagFilterBarPreference } from "@/hooks/useTagFilterBarPreference";
import { useURLTagFilter } from "@/hooks/useURLTagFilter";
import type { PageSummary } from "@/types/page";
import { isClipUrlAllowed } from "@/lib/webClipper";

/**
 * Note detail page: pages grid, add/remove, header actions.
 * ノート詳細（ページ一覧・追加・削除・ヘッダーアクション）。
 */
const NoteView: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // `?clipUrl=<URL>` を読み取り、検証 OK の値だけ FAB に渡す（issue #826）。
  // クライアント側で `isClipUrlAllowed` を通すことで、`/notes/me` を経由せず
  // 直接ノート URL を踏まれた場合でもサーバー側 `clipUrlPolicy` と同じルール
  // で弾く。検証 NG の値は静かに無視する（再ロードで誤って起動しない）。
  //
  // Read `?clipUrl=<URL>` and forward only validated values to the FAB
  // (issue #826). Re-running the same `isClipUrlAllowed` check the server
  // applies in `clipUrlPolicy.ts` keeps direct hits to `/notes/:id` safe even
  // when callers skip `/notes/me`. Invalid values are ignored quietly so a
  // refresh doesn't relaunch the dialog.
  const rawClipUrl = searchParams.get("clipUrl");
  const validClipUrl = rawClipUrl && isClipUrlAllowed(rawClipUrl) ? rawClipUrl : null;

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const noteSource = source === "remote" ? "remote" : "local";
  const { canView, canEdit, canShowAddPage, canManageMembers } = getNoteViewPermissions(
    access,
    noteSource,
  );
  const isLoading = isNoteLoading;
  const isNotFound = !note || !access?.canView;

  // issue #860 Phase 3: `NoteAddPageDialog` は `notePages` 配列を受け取らなくなった
  // （重複判定の no-op 化に伴い prop ごと除去）。ノートのページ一覧は `PageGrid`
  // 配下の `useInfiniteNotePages` だけが取りに行く。
  // Issue #860 Phase 3: `NoteAddPageDialog` no longer takes a `notePages`
  // array — the duplicate filter was a no-op and the prop was removed. The
  // note's page list is now fetched only by `useInfiniteNotePages` inside
  // `PageGrid`.

  const [isAddPageOpen, setIsAddPageOpen] = useState(false);

  /**
   * ページごとの削除可否を `access.canDeletePage(addedByUserId)` で判定する
   * コールバック。オーナーは全削除可、エディターは自分が追加したページのみ
   * 削除可、という旧 `NoteViewPageGrid` の挙動を `PageGrid` 上で再現する。
   * `addedByUserId` は `NotePageSummary` だけが持つフィールドのため、
   * `PageGrid` 側のシグネチャ (`PageSummary`) に合わせてキャストして取り出す。
   *
   * Per-page delete callback that mirrors the old `NoteViewPageGrid`
   * behavior: owners may delete any page, editors only the ones they added.
   * `addedByUserId` only exists on `NotePageSummary`, so we read it through
   * a narrow cast against the `PageSummary` signature `PageGrid` exposes.
   * The server's `canEdit` guard remains authoritative.
   */
  const canDeletePageInGrid = useCallback(
    (page: PageSummary) => {
      const fn = access?.canDeletePage;
      if (!fn) return false;
      const addedByUserId = (page as PageSummary & { addedByUserId?: string | null }).addedByUserId;
      if (addedByUserId == null || addedByUserId === "") return false;
      return fn(addedByUserId);
    },
    [access],
  );

  /**
   * クリップダイアログを閉じたとき、URL から `clipUrl` クエリだけを除去する。
   * 他のクエリ・ハッシュは保持する。再ロードで誤ってダイアログが再起動しない
   * ようにするための副作用なし側のクリーンアップ（旧 `Home.tsx` から移植）。
   *
   * Strip the `clipUrl` query when the clip dialog closes, while keeping the
   * rest of the search and hash intact. Without this the dialog would
   * re-open on refresh; ported from the old `Home.tsx` cleanup hook.
   */
  const handleClipDialogClosedWithInitialUrl = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("clipUrl");
    const nextSearch = next.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [navigate, location.pathname, location.hash, searchParams]);

  if (isLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }
  if (isNotFound) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </PageLoadingOrDenied>
    );
  }

  return (
    <ContentWithAIChat
      floatingAction={
        canEdit || canShowAddPage ? (
          <div className="mr-4 mb-4 flex flex-col items-end gap-2">
            <FloatingActionButton
              noteId={note.id}
              onAddExistingPage={canShowAddPage ? () => setIsAddPageOpen(true) : undefined}
              initialClipUrl={validClipUrl && canEdit ? validClipUrl : undefined}
              onClipDialogClosedWithInitialUrl={
                validClipUrl && canEdit ? handleClipDialogClosedWithInitialUrl : undefined
              }
              hiddenOptions={canEdit ? undefined : ["blank", "url", "image"]}
            />
          </div>
        ) : undefined
      }
    >
      <div className="min-h-0 flex-1 py-6">
        <Container>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="whitespace-nowrap">
                  <NoteTitleSwitcher noteId={note.id} noteTitle={note.title} variant="heading" />
                </h1>
                <NoteShareUrlCopyButton noteId={note.id} visibility={note.visibility} />
                <NoteVisibilityBadge visibility={note.visibility} />
                {note.isOfficial && <Badge variant="secondary">{t("notes.officialBadge")}</Badge>}
              </div>
            </div>
            <NoteViewHeaderActions
              note={note}
              canManageMembers={canManageMembers}
              canView={canView}
              userRole={access?.role ?? "none"}
            />
          </div>
          <NoteViewPageList
            noteId={note.id}
            canEdit={canEdit}
            canDeletePageInGrid={canDeletePageInGrid}
          />
          {/* PageGrid 描画は NoteViewPageList 内に閉じ込めて、`useURLTagFilter`
              の `selected` を `TagFilterBar` と `PageGrid` の両方に同期する。
              The page list and filter bar live together so the URL-driven
              selection drives both surfaces in lock-step. */}
        </Container>
      </div>
      {canShowAddPage && (
        <NoteAddPageDialog
          open={isAddPageOpen}
          onOpenChange={setIsAddPageOpen}
          noteId={note.id}
          canEdit={canEdit}
        />
      )}
    </ContentWithAIChat>
  );
};

/**
 * ノート文脈のページ一覧 + 上部のタグフィルタバーをまとめたサブコンポーネント。
 * `useURLTagFilter` で `?tags=` を読み書きし、`TagFilterBar` と `PageGrid` の
 * 両方に同じ `selected` 状態を流し込む。`useTagFilterBarPreference` で
 * バーの表示可否を解決し、ノート既定 + ユーザー上書きが両方 false のときは
 * バー自体をマウントしない（タグ集計 API も呼ばない）。
 *
 * Pairs the tag filter bar with the page grid so the URL-driven selection
 * drives both. The bar is only mounted when {@link useTagFilterBarPreference}
 * resolves to enabled, which also gates the aggregation fetch.
 */
const NoteViewPageList: React.FC<{
  noteId: string;
  canEdit: boolean;
  canDeletePageInGrid: (page: PageSummary) => boolean;
}> = ({ noteId, canEdit, canDeletePageInGrid }) => {
  const { enabled: showFilterBar } = useTagFilterBarPreference(noteId);
  const { selected, setSelected } = useURLTagFilter();
  const aggregation = useNoteTagAggregation(noteId, { enabled: showFilterBar });

  // バーが非表示のとき、URL に残った `?tags=foo` をそのまま PageGrid に流すと
  // 「絞り込みが効いているのに UI から解除できない」幽霊フィルタ状態になる
  // (ノート切替で URL が引き継がれた場合など、PR #897 Codex P1)。バーが
  // 出ていないときは強制的に `none-selected` 扱いにして、フィルタは UI が
  // 復活したときだけ機能するように倒す。URL は触らずに残しておくので、
  // バーを再表示すれば前回の選択が復元される。
  //
  // Forwarding the URL-derived selection while the bar is hidden produces a
  // phantom filter — the page list is constrained but there's no UI control
  // to clear it (PR #897 Codex P1, e.g. when navigating from another note
  // that left `?tags=` behind). Treat the filter as `none-selected` whenever
  // the bar is hidden; we keep the URL untouched so the selection comes back
  // if the user re-enables the bar.
  const effectiveTagFilter = showFilterBar ? selected : { kind: "none-selected" as const };

  return (
    <>
      {showFilterBar && (
        <div className="mb-3">
          <TagFilterBar
            items={aggregation.items}
            noneCount={aggregation.noneCount}
            selected={selected}
            onChange={setSelected}
            isLoading={aggregation.isLoading}
          />
        </div>
      )}
      <div className="mt-4">
        <PageGrid
          noteId={noteId}
          canEdit={canEdit}
          canDeletePage={canDeletePageInGrid}
          tagFilter={effectiveTagFilter}
        />
      </div>
    </>
  );
};

export default NoteView;
