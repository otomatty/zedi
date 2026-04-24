import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, MoreHorizontal } from "lucide-react";
import Container from "@/components/layout/Container";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import {
  useNote,
  useNotePage,
  noteKeys,
  useCopyNotePageToPersonal,
  useNoteApi,
} from "@/hooks/useNoteQueries";
import { useUpdatePage } from "@/hooks/usePageQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteWorkspaceProvider, useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { NoteWorkspaceToolbar } from "@/components/note/NoteWorkspaceToolbar";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { Page } from "@/types/page";

const TITLE_SAVE_DEBOUNCE_MS = 500;

function canEditPage(
  access: { canEdit?: boolean; canView?: boolean } | undefined,
  userId: string | undefined,
  page: { ownerUserId?: string } | null | undefined,
): boolean {
  if (!access?.canView) return false;
  if (access.canEdit) return true;
  return Boolean(userId && page?.ownerUserId && page.ownerUserId === userId);
}

/**
 * リンク済み個人ページ (`noteId === null`) のタイトル更新はページ所有者だけに許す。
 * ノートネイティブページ (`noteId !== null`) はノート権限 (`canEdit`) 側で別判定する。
 * For linked personal pages (`noteId === null`), only the page owner may edit
 * the title. Note-native pages (`noteId !== null`) are gated separately by
 * note-level edit permission.
 */
function canEditTitle(
  userId: string | undefined,
  page: { ownerUserId?: string } | null | undefined,
): boolean {
  return Boolean(userId && page?.ownerUserId && page.ownerUserId === userId);
}

/**
 * Uses `key` on the parent so page switches reset local editor state.
 * `editorContent` の初期値は `page.content` から。
 */
function NotePageEditorEditable({
  page,
  noteId,
  collaboration,
  isCollaborationEnabled,
  isTitleEditable,
}: {
  page: Page;
  noteId: string;
  collaboration: UseCollaborationReturn;
  isCollaborationEnabled: boolean;
  /** ページ所有者のみタイトル編集可。Only the page owner can edit the title. */
  isTitleEditable: boolean;
}): React.JSX.Element {
  const [editorContent, setEditorContent] = useState(page.content ?? "");
  const [title, setTitle] = useState(page.title);
  const { api } = useNoteApi();
  const { setPageContext, contentAppendHandlerRef, insertAtCursorRef } = useAIChatContext();
  const noteWorkspace = useNoteWorkspaceOptional();
  const workspaceRoot = noteWorkspace?.workspaceRoot ?? null;
  const editorInsertRef = useRef<((content: unknown) => boolean) | null>(null);
  const updatePageMutation = useUpdatePage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const isSavingTitleRef = useRef(false);
  const lastSavedTitleRef = useRef(page.title);

  useEffect(() => {
    setPageContext({
      type: "editor",
      pageId: page.id,
      noteId,
      claudeWorkspaceRoot: workspaceRoot ?? undefined,
      pageTitle: title,
      pageContent: editorContent.slice(0, 3000),
      pageFullContent: editorContent,
    });
  }, [page.id, title, editorContent, setPageContext, noteId, workspaceRoot]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    contentAppendHandlerRef.current = setEditorContent;
    return () => {
      contentAppendHandlerRef.current = null;
    };
  }, [contentAppendHandlerRef]);

  useEffect(() => {
    insertAtCursorRef.current = (markdown: string) => {
      if (!editorInsertRef.current) return false;
      try {
        const docJson = convertMarkdownToTiptapContent(markdown);
        const doc = JSON.parse(docJson) as { content: unknown[] };
        return editorInsertRef.current(doc.content);
      } catch {
        return false;
      }
    };
    return () => {
      insertAtCursorRef.current = null;
    };
  }, [insertAtCursorRef]);

  // 最新の persistTitle をミュータブルな ref に退避する。useMutation の戻り値は
  // 状態遷移（idle → pending → success）ごとに identity が変わるため、直接
  // useCallback の依存に入れるとアンマウント用 effect の cleanup が過剰発火し、
  // 保留中の保存が debounce を待たずに走ってしまう。ref 経由なら effect 側は
  // 安定した参照だけを見て済む。
  // Keep the latest persistTitle in a mutable ref. `useMutation()` returns a new
  // object on every state transition (idle → pending → success), so referencing
  // the mutation directly in a `useCallback` dep array would cause the unmount
  // flush effect's cleanup to fire mid-typing and flush the debounce early.
  const persistTitleRef = useRef<(nextTitle: string) => Promise<void>>(async () => {});
  persistTitleRef.current = async (nextTitle: string) => {
    const previousTitle = lastSavedTitleRef.current;
    try {
      if (page.noteId !== null) {
        const current = await api.getPageContent(page.id);
        await api.putPageContent(page.id, {
          ydoc_state: current.ydoc_state,
          content_text: current.content_text ?? undefined,
          expected_version: current.version,
          title: nextTitle,
        });
      } else {
        await updatePageMutation.mutateAsync({
          pageId: page.id,
          updates: { title: nextTitle },
        });
      }
      lastSavedTitleRef.current = nextTitle;
      // `useUpdatePage` updates `pageKeys.*` caches, but the note page list and
      // detail are held under `noteKeys.*`. Invalidate those so the new title
      // propagates to the note view and sidebar.
      // `useUpdatePage` は `pageKeys.*` を更新するが、ノート側のキャッシュは
      // `noteKeys.*` にあるため、タイトル変更をノート表示やサイドバーに反映
      // させるには明示的に無効化する必要がある。
      queryClient.invalidateQueries({ queryKey: noteKeys.page(noteId, page.id) });
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(noteId) });
    } catch (error) {
      if (pendingTitleRef.current === null) {
        setTitle(previousTitle);
      }
      console.error("Failed to save page title:", error);
      toast({
        title: "タイトルの保存に失敗しました",
        description: "通信環境を確認し、再度お試しください。",
        variant: "destructive",
      });
      throw error;
    }
  };

  // タイトル保存を直列化する。保存中なら何もせず、完了後に pending があれば
  // 追随保存する。これにより「古いリクエストが遅延完了して新しい値を上書きする」
  // 先祖返りを防止する。
  // Serialize title saves: skip while a save is in-flight, and re-run once it
  // completes if a newer title is pending. This prevents an out-of-order
  // response from overwriting a more recent edit.
  const flushPendingTitleRef = useRef<() => void>(() => {});
  flushPendingTitleRef.current = () => {
    if (isSavingTitleRef.current) return;
    const pending = pendingTitleRef.current;
    if (pending === null) return;
    pendingTitleRef.current = null;
    isSavingTitleRef.current = true;
    void (async () => {
      try {
        await persistTitleRef.current(pending);
      } catch {
        // persistTitleRef で toast + console.error 済み。ここは coalesce 継続のため握る。
        // Already logged + toasted inside persistTitleRef; swallow so we keep coalescing.
      } finally {
        isSavingTitleRef.current = false;
        if (pendingTitleRef.current !== null) {
          flushPendingTitleRef.current();
        }
      }
    })();
  };

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    pendingTitleRef.current = newTitle;
    if (titleSaveTimerRef.current) {
      clearTimeout(titleSaveTimerRef.current);
    }
    titleSaveTimerRef.current = setTimeout(() => {
      titleSaveTimerRef.current = null;
      flushPendingTitleRef.current();
    }, TITLE_SAVE_DEBOUNCE_MS);
  }, []);

  // アンマウント時に debounce 中のタイトル保存を即時フラッシュし、遷移で失われないようにする。
  // deps は空配列 — ref 経由のみで参照しているため、mutation 状態遷移で cleanup が走らない。
  // Flush any debounced title save on unmount so navigation does not drop it.
  // Empty deps: we only read refs, so cleanup does not fire on mutation state transitions.
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
      }
      flushPendingTitleRef.current();
    };
  }, []);

  return (
    <ContentWithAIChat>
      <NoteWorkspaceToolbar />
      <PageEditorContent
        content={editorContent}
        title={title}
        sourceUrl={page.sourceUrl}
        currentPageId={page.id}
        pageId={page.id}
        isNewPage={false}
        isWikiGenerating={false}
        isReadOnly={false}
        showLinkedPages={false}
        showToolbar
        onContentChange={setEditorContent}
        onContentError={() => undefined}
        onTitleChange={isTitleEditable ? handleTitleChange : undefined}
        collaboration={isCollaborationEnabled ? collaboration : undefined}
        insertAtCursorRef={editorInsertRef}
        pageNoteId={page.noteId ?? null}
      />
    </ContentWithAIChat>
  );
}

/**
 * Single page inside a note (collaboration, AI chat, optional linked workspace).
 * ノート内の 1 ページ（コラボ・AI チャット・任意のワークスペース連携）。
 */
const NotePageView: React.FC = () => {
  const { noteId, pageId } = useParams<{ noteId: string; pageId: string }>();
  const navigate = useNavigate();
  const { isSignedIn, userId } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const copyToPersonalMutation = useCopyNotePageToPersonal();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const { data: page, isLoading: isPageLoading } = useNotePage(
    noteId ?? "",
    pageId ?? "",
    source,
    Boolean(access?.canView),
  );

  const handleBack = useCallback(() => {
    if (noteId) {
      navigate(`/notes/${noteId}`);
    } else {
      navigate("/home");
    }
  }, [navigate, noteId]);

  const canEdit = canEditPage(access, userId, page);
  const isTitleEditable = canEdit && (page?.noteId != null || canEditTitle(userId, page));
  const collaborationPageId = page?.id ?? "";
  const isCollaborationEnabled = Boolean(collaborationPageId && isSignedIn && canEdit);
  const collaboration = useCollaboration({
    pageId: collaborationPageId,
    enabled: isCollaborationEnabled,
    mode: "collaborative",
  });

  // ノートネイティブページを自分の個人ページにコピーする (issue #713 Phase 3)。
  // 元のノートページはノートに残り、コピーのみが呼び出し元の /home に現れる。
  // 成功時はトーストで新しい個人ページへ誘導する。
  // Copy this note-native page into the caller's personal pages. Source stays
  // in the note; only the copy lands on /home. Toast offers to jump to it.
  const handleCopyToPersonal = async () => {
    if (!noteId || !page?.id) return;
    try {
      const result = await copyToPersonalMutation.mutateAsync({
        noteId,
        sourcePageId: page.id,
      });
      // サーバーへのコピーは成功だが、ローカル IDB への書き戻しが失敗/スキップ
      // された場合は `localImported: false`。その状態で「開く」CTA を押すと
      // `/pages/:id` は IDB を読むので空に着地してしまうため、成功トースト自体
      // は出すが CTA は外して次回 sync まで待つ。
      //
      // If the server-side copy succeeded but the IndexedDB write-through did
      // not (`localImported: false`), navigating `/pages/:id` would land on
      // an empty read because the page grid reads IDB. Keep the success toast
      // but drop the "Open" CTA; the next sync will reconcile `/home`.
      toast({
        title: t("notes.pageCopiedToPersonal"),
        action: result.localImported ? (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/pages/${result.page_id}`)}>
            {t("common.open", "開く")}
          </Button>
        ) : undefined,
      });
    } catch (error) {
      console.error("Failed to copy note page to personal:", error);
      toast({
        title: t("notes.pageCopyToPersonalFailed"),
        variant: "destructive",
      });
    }
  };

  const isLoading = isNoteLoading || isPageLoading;
  const isNotFound = !note || !access?.canView || !page;
  if (isLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">読み込み中...</p>
      </PageLoadingOrDenied>
    );
  }
  if (isNotFound) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">
          ページが見つからないか、閲覧権限がありません。
        </p>
      </PageLoadingOrDenied>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border/60 shrink-0 border-b">
        <Container className="flex h-10 items-center justify-between">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            {!canEdit && <span className="text-muted-foreground text-xs">閲覧専用</span>}
            {/*
              「個人に取り込み」はノートネイティブページ (`page.noteId === noteId`) だけに出す。
              このノートにリンクされているだけの個人ページ (`page.noteId === null`) は、
              所有者ならすでに /home にあり、他メンバーにはサーバーがコピーを拒否する
              （`Page does not belong to this note`）ため、メニューに出すと決め打ちで
              失敗するアクションになる。両方の意味でリンク済みページでは出さない。
              Issue #713 Phase 3 / Codex P2。

              Gate "copy to personal" to note-native pages (`page.noteId === noteId`).
              Linked personal pages (`page.noteId === null`) are already on the
              owner's /home and, for other members, the server rejects the copy
              (`Page does not belong to this note`). Showing the action for them
              is a guaranteed-fail path, so hide it. Issue #713 Phase 3 / Codex P2.
            */}
            {isSignedIn && page.noteId === noteId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.moreActions", "More actions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleCopyToPersonal}
                    disabled={copyToPersonalMutation.isPending}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("notes.copyToPersonal")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </Container>
      </div>

      {/* 編集時は `ContentWithAIChat` 側がスクロールを管理するため、このラッパーでは
          二重スクロールを避ける。閲覧専用時は従来どおりここで本文をスクロールさせる。
          When editing, `ContentWithAIChat` owns the scroll container, so keep
          this wrapper non-scrollable to avoid nested scroll regions. In
          read-only mode, this wrapper still scrolls the page body. */}
      {/* 編集時は ContentWithAIChat 内のモバイルスクロールラッパー（flex-1 +
          overflow-y-auto）に高さを伝搬させるため、このラッパーも flex 列にする。
          ブロックレイアウトのままだと子の `flex-1` が効かず、スクロールラッパーが
          コンテンツ高さに張り付き overflow-y-auto が発火しない。
          When editing, this wrapper must be a flex column so the bounded height
          propagates down to ContentWithAIChat's mobile scroll wrapper (which
          relies on flex-1). Without `flex flex-col`, the child's `flex-1` is a
          no-op in block layout and `overflow-y-auto` never engages. */}
      <div
        className={
          canEdit
            ? "flex min-h-0 flex-1 flex-col md:overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto md:overflow-hidden"
        }
      >
        <NoteWorkspaceProvider key={note.id} noteId={note.id}>
          {canEdit ? (
            <NotePageEditorEditable
              key={page.id}
              noteId={note.id}
              page={page}
              collaboration={collaboration}
              isCollaborationEnabled={isCollaborationEnabled}
              isTitleEditable={isTitleEditable}
            />
          ) : (
            <PageEditorContent
              content={page?.content ?? ""}
              title={page.title}
              sourceUrl={page.sourceUrl}
              currentPageId={page.id}
              pageId={page.id}
              isNewPage={false}
              isWikiGenerating={false}
              isReadOnly={true}
              showLinkedPages={false}
              showToolbar={false}
              onContentChange={() => undefined}
              onContentError={() => undefined}
              pageNoteId={page.noteId ?? null}
            />
          )}
        </NoteWorkspaceProvider>
      </div>
    </div>
  );
};

export default NotePageView;
