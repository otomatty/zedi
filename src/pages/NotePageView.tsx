import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import Container from "@/components/layout/Container";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import { Button } from "@zedi/ui";
import { useNote, useNotePage } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { useAIChatContext } from "@/contexts/AIChatContext";
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

/** key={page.id} でページ切替時にリセット。editorContent の初期値を page.content から取得。 */
function NotePageEditorEditable({
  page,
  collaboration,
  isCollaborationEnabled,
}: {
  page: Page;
  collaboration: UseCollaborationReturn;
  isCollaborationEnabled: boolean;
}) {
  const [editorContent, setEditorContent] = useState(page.content ?? "");
  const { setPageContext, contentAppendHandlerRef } = useAIChatContext();

  useEffect(() => {
    setPageContext({
      type: "editor",
      pageId: page.id,
      pageTitle: page.title,
      pageContent: editorContent.slice(0, 3000),
      pageFullContent: editorContent,
    });
  }, [page.id, page.title, editorContent, setPageContext]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    contentAppendHandlerRef.current = setEditorContent;
    return () => {
      contentAppendHandlerRef.current = null;
    };
  }, [contentAppendHandlerRef]);

  return (
    <ContentWithAIChat>
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
      />
    </ContentWithAIChat>
  );
}

/**
 *
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
      navigate(`/note/${noteId}`);
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
      <AppLayout>
        <main className="min-h-0 flex-1 overflow-y-auto py-10">
          <Container>
            <p className="text-muted-foreground text-sm">読み込み中...</p>
          </Container>
        </main>
      </AppLayout>
    );
  }
  if (isNotFound) {
    return (
      <AppLayout>
        <main className="min-h-0 flex-1 overflow-y-auto py-10">
          <Container>
            <p className="text-muted-foreground text-sm">
              ページが見つからないか、閲覧権限がありません。
            </p>
          </Container>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-border/60 shrink-0 border-b">
          <Container className="flex h-10 items-center justify-between">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {!canEdit && <span className="text-muted-foreground text-xs">閲覧専用</span>}
          </Container>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {canEdit ? (
            <NotePageEditorEditable
              key={page.id}
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
        </div>
      </div>
    </AppLayout>
  );
};

export default NotePageView;
