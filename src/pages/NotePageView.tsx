import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Container from "@/components/layout/Container";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import { Button } from "@zedi/ui";
import { useNote, useNotePage } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { NoteWorkspaceProvider, useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { NoteWorkspaceToolbar } from "@/components/note/NoteWorkspaceToolbar";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";
import type { Page } from "@/types/page";

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
  const { setPageContext, contentAppendHandlerRef, insertAtCursorRef } = useAIChatContext();
  const noteWorkspace = useNoteWorkspaceOptional();
  const workspaceRoot = noteWorkspace?.workspaceRoot ?? null;
  const editorInsertRef = useRef<((content: unknown) => boolean) | null>(null);

  useEffect(() => {
    setPageContext({
      type: "editor",
      pageId: page.id,
      noteId,
      claudeWorkspaceRoot: workspaceRoot ?? undefined,
      pageTitle: page.title,
      pageContent: editorContent.slice(0, 3000),
      pageFullContent: editorContent,
    });
  }, [page.id, page.title, editorContent, setPageContext, noteId, workspaceRoot]);

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

  return (
    <ContentWithAIChat>
      <NoteWorkspaceToolbar />
      <PageEditorContent
        content={editorContent}
        title={page.title}
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

      {/* モバイルは `ContentWithAIChat` が独自のスクロール領域を持たないため、ここをスクロールコンテナにする。
          On mobile, `ContentWithAIChat` lacks its own scroll viewport, so this div must scroll. */}
      <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
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
