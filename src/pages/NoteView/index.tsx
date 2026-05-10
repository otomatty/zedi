import React, { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NotePageCount } from "@/components/note/NotePageCount";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Badge, useToast } from "@zedi/ui";
import { NoteAddPageDialog } from "./NoteAddPageDialog";
import { useNote, useNoteApi, useNotePages, useRemovePageFromNote } from "@/hooks/useNoteQueries";
import { useTranslation } from "react-i18next";
import { getNoteViewPermissions } from "./noteViewHelpers";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import { NoteViewMainContent } from "./NoteViewMainContent";
import { isClipUrlAllowed } from "@/lib/webClipper";

/**
 * Note detail page: pages grid, add/remove, header actions.
 * ノート詳細（ページ一覧・追加・削除・ヘッダーアクション）。
 */
const NoteView: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const { toast } = useToast();
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

  const { isSignedIn } = useNoteApi();
  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const noteSource = source === "remote" ? "remote" : "local";
  const { canEdit, canShowAddPage, canManageMembers } = getNoteViewPermissions(access, noteSource);
  const isLoading = isNoteLoading;
  const isNotFound = !note || !access?.canView;

  const canDeletePage = useCallback(
    (addedByUserId: string | null | undefined) => {
      if (addedByUserId == null || addedByUserId === "") return false;
      const fn = access?.canDeletePage;
      if (!fn) return false;
      return fn(addedByUserId);
    },
    [access],
  );

  const { data: notePages = [], isLoading: isPagesLoading } = useNotePages(
    noteId ?? "",
    noteSource,
    Boolean(access?.canView),
  );

  const removePageMutation = useRemovePageFromNote();
  const [isAddPageOpen, setIsAddPageOpen] = useState(false);

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

  const handleRemovePage = async (pageId: string) => {
    if (!noteId) return;
    try {
      await removePageMutation.mutateAsync({ noteId, pageId });
      toast({ title: t("notes.pageRemoved") });
    } catch (error) {
      console.error("Failed to remove page:", error);
      toast({ title: t("notes.pageRemoveFailed"), variant: "destructive" });
    }
  };

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
        <div className="mr-4 mb-4 flex flex-col items-end gap-2">
          <NotePageCount noteId={note.id} />
          {(canEdit || canShowAddPage) && (
            <FloatingActionButton
              noteId={note.id}
              onAddExistingPage={canShowAddPage ? () => setIsAddPageOpen(true) : undefined}
              initialClipUrl={validClipUrl && canEdit ? validClipUrl : undefined}
              onClipDialogClosedWithInitialUrl={
                validClipUrl && canEdit ? handleClipDialogClosedWithInitialUrl : undefined
              }
              hiddenOptions={canEdit ? undefined : ["blank", "url", "image"]}
            />
          )}
        </div>
      }
    >
      <div className="min-h-0 flex-1 py-6">
        <Container>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">
                  {note.title || t("notes.untitledNote")}
                </h1>
                <NoteVisibilityBadge visibility={note.visibility} />
                {note.isOfficial && <Badge variant="secondary">{t("notes.officialBadge")}</Badge>}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("notes.pagesCount", { count: notePages.length })}
              </p>
            </div>
            <NoteViewHeaderActions
              note={note}
              canManageMembers={canManageMembers}
              isSignedIn={isSignedIn}
              canView={Boolean(access?.canView)}
              userRole={access?.role ?? "none"}
            />
          </div>
          <NoteViewMainContent
            noteId={note.id}
            notePages={notePages}
            isPagesLoading={isPagesLoading}
            canDeletePage={canDeletePage}
            onRemovePage={handleRemovePage}
          />
        </Container>
      </div>
      {canShowAddPage && (
        <NoteAddPageDialog
          open={isAddPageOpen}
          onOpenChange={setIsAddPageOpen}
          noteId={note.id}
          notePages={notePages}
          canEdit={canEdit}
        />
      )}
    </ContentWithAIChat>
  );
};

export default NoteView;
