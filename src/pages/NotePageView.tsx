import React, { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Edit3 } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { PageEditorContent } from "@/components/editor/PageEditor/PageEditorContent";
import { Button } from "@/components/ui/button";
import { useNote, useNotePage } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";

const NotePageView: React.FC = () => {
  const { noteId, pageId } = useParams<{ noteId: string; pageId: string }>();
  const navigate = useNavigate();
  const { userId } = useAuth();

  const { note, access, source, isLoading: isNoteLoading } = useNote(
    noteId ?? "",
    { allowRemote: true }
  );

  const { data: page, isLoading: isPageLoading } = useNotePage(
    noteId ?? "",
    pageId ?? "",
    source,
    Boolean(access?.canView)
  );

  const handleBack = useCallback(() => {
    if (noteId) {
      navigate(`/note/${noteId}`);
    } else {
      navigate("/home");
    }
  }, [navigate, noteId]);

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

  const canEdit = Boolean(page.ownerUserId && page.ownerUserId === userId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="border-b border-border/60">
        <Container className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {note.title || "無題のノート"}
              </p>
              <h1 className="text-lg font-semibold truncate">
                {page.title || "無題のページ"}
              </h1>
            </div>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/page/${page.id}`)}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              編集
            </Button>
          )}
        </Container>
      </div>

      <PageEditorContent
        content={page.content}
        title={page.title}
        sourceUrl={page.sourceUrl}
        currentPageId={page.id}
        pageId={page.id}
        isNewPage={false}
        isWikiGenerating={false}
        isReadOnly
        showLinkedPages={false}
        showToolbar={false}
        onContentChange={() => undefined}
        onContentError={() => undefined}
      />
    </div>
  );
};

export default NotePageView;
