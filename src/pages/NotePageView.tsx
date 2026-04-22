import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Container from "@/components/layout/Container";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import { Button } from "@zedi/ui";
import { useNote, useNotePage, noteKeys } from "@/hooks/useNoteQueries";
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
 * Uses `key` on the parent so page switches reset local editor state.
 * `editorContent` の初期値は `page.content` から。
 */
function NotePageEditorEditable({
  page,
  noteId,
  collaboration,
  isCollaborationEnabled,
}: {
  page: Page;
  noteId: string;
  collaboration: UseCollaborationReturn;
  isCollaborationEnabled: boolean;
}): React.JSX.Element {
  const [editorContent, setEditorContent] = useState(page.content ?? "");
  const [title, setTitle] = useState(page.title);
  const { setPageContext, contentAppendHandlerRef, insertAtCursorRef } = useAIChatContext();
  const noteWorkspace = useNoteWorkspaceOptional();
  const workspaceRoot = noteWorkspace?.workspaceRoot ?? null;
  const editorInsertRef = useRef<((content: unknown) => boolean) | null>(null);
  const updatePageMutation = useUpdatePage();
  const queryClient = useQueryClient();
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTitleRef = useRef<string | null>(null);

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

  const persistTitle = useCallback(
    async (nextTitle: string) => {
      try {
        await updatePageMutation.mutateAsync({
          pageId: page.id,
          updates: { title: nextTitle },
        });
        // `useUpdatePage` updates `pageKeys.*` caches, but the note page list and
        // detail are held under `noteKeys.*`. Invalidate those so the new title
        // propagates to the note view and sidebar.
        // `useUpdatePage` は `pageKeys.*` を更新するが、ノート側のキャッシュは
        // `noteKeys.*` にあるため、タイトル変更をノート表示やサイドバーに反映
        // させるには明示的に無効化する必要がある。
        queryClient.invalidateQueries({ queryKey: noteKeys.page(noteId, page.id) });
        queryClient.invalidateQueries({ queryKey: noteKeys.pageList(noteId) });
      } catch (error) {
        console.error("Failed to save page title:", error);
      }
    },
    [noteId, page.id, queryClient, updatePageMutation],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      pendingTitleRef.current = newTitle;
      if (titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
      }
      titleSaveTimerRef.current = setTimeout(() => {
        titleSaveTimerRef.current = null;
        const pending = pendingTitleRef.current;
        pendingTitleRef.current = null;
        if (pending !== null) {
          void persistTitle(pending);
        }
      }, TITLE_SAVE_DEBOUNCE_MS);
    },
    [persistTitle],
  );

  // アンマウント時に debounce 中のタイトル保存を即時フラッシュし、遷移で失われないようにする。
  // Flush any debounced title save on unmount so navigation does not drop it.
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) {
        clearTimeout(titleSaveTimerRef.current);
        titleSaveTimerRef.current = null;
        const pending = pendingTitleRef.current;
        pendingTitleRef.current = null;
        if (pending !== null) {
          void persistTitle(pending);
        }
      }
    };
  }, [persistTitle]);

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
        onTitleChange={handleTitleChange}
        collaboration={isCollaborationEnabled ? collaboration : undefined}
        insertAtCursorRef={editorInsertRef}
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
  const collaborationPageId = page?.id ?? "";
  const isCollaborationEnabled = Boolean(collaborationPageId && isSignedIn && canEdit);
  const collaboration = useCollaboration({
    pageId: collaborationPageId,
    enabled: isCollaborationEnabled,
    mode: "collaborative",
  });

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
          {!canEdit && <span className="text-muted-foreground text-xs">閲覧専用</span>}
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
            />
          )}
        </NoteWorkspaceProvider>
      </div>
    </div>
  );
};

export default NotePageView;
