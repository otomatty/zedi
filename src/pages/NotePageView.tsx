import React, { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import { Button } from "@/components/ui/button";
import { useNote, useNotePage } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { useCollaboration } from "@/hooks/useCollaboration";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { useAIChatContext } from "@/contexts/AIChatContext";

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

  // canEdit: ノートのロール（owner/editor）または自分のページであれば編集可能
  const isOwnPage = Boolean(userId && page?.ownerUserId && page.ownerUserId === userId);
  const canEdit = Boolean(access?.canEdit) || isOwnPage;
  const collaborationPageId = page?.id ?? "";
  const isCollaborationEnabled = Boolean(collaborationPageId && isSignedIn && canEdit);
  const collaboration = useCollaboration({
    pageId: collaborationPageId,
    enabled: isCollaborationEnabled,
    mode: "collaborative",
  });

  // canEdit時のみAIチャットにページコンテキストを設定
  const { setPageContext } = useAIChatContext();
  useEffect(() => {
    if (canEdit && page) {
      setPageContext({
        type: "editor",
        pageId: page.id,
        pageTitle: page.title,
        pageContent: page.content?.slice(0, 3000) ?? "",
      });
    }
    return () => setPageContext(null);
  }, [canEdit, page, setPageContext]);

  if (isNoteLoading || isPageLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          </Container>
        </main>
      </div>
    );
  }

  if (!note || !access?.canView || !page) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">
              ページが見つからないか、閲覧権限がありません。
            </p>
          </Container>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="border-b border-border/60">
        <Container className="flex h-10 items-center justify-between">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {!canEdit && <span className="text-xs text-muted-foreground">閲覧専用</span>}
        </Container>
      </div>

      {canEdit ? (
        <ContentWithAIChat>
          <PageEditorContent
            content={page.content}
            title={page.title}
            sourceUrl={page.sourceUrl}
            currentPageId={page.id}
            pageId={page.id}
            isNewPage={false}
            isWikiGenerating={false}
            isReadOnly={!canEdit}
            showLinkedPages={false}
            showToolbar={canEdit}
            onContentChange={() => undefined}
            onContentError={() => undefined}
            collaboration={isCollaborationEnabled ? collaboration : undefined}
          />
        </ContentWithAIChat>
      ) : (
        <PageEditorContent
          content={page.content}
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
  );
};

export default NotePageView;
