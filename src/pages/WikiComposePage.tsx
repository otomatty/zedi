/**
 * `WikiComposePage` — Wiki Compose split-screen UI (#950).
 *
 * `/notes/:noteId/:pageId/compose` (および `compose/:sessionId`) のルート要素。
 * 左ペイン = `EditorPane` (タイトル + 進捗中の本文プレビュー)、右ペイン =
 * `ComposePanel` (PhaseStepper + Dialogue + Research + Activity)。
 * モバイルでは縦分割、デスクトップでは横分割で表示する。Compose 完了 / 中断
 * 時はノートページに戻れる。
 *
 * Compose UI shell. The page reads the `useWikiComposeSession` hook for state
 * and routes user submissions back through the hook's mutator methods.
 */
import React, { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useIsMobile,
} from "@zedi/ui";
import { useWikiComposeSession } from "@/hooks/useWikiComposeSession";
import type { DraftedSection } from "@/lib/wikiCompose/types";
import { EditorPane } from "@/components/wikiCompose/EditorPane";
import { ComposePanel } from "@/components/wikiCompose/ComposePanel";

/** Map drafted section list to a quick lookup. */
function indexById(items: DraftedSection[]): Record<string, DraftedSection> {
  const out: Record<string, DraftedSection> = {};
  for (const it of items) out[it.sectionId] = it;
  return out;
}

/** Root page for `/notes/:noteId/:pageId/compose[/:sessionId]`. */
const WikiComposePage: React.FC = () => {
  const params = useParams<{ noteId: string; pageId: string; sessionId?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const noteId = params.noteId ?? "";
  const pageId = params.pageId ?? "";
  const sessionId = params.sessionId ?? null;

  const session = useWikiComposeSession({
    pageId,
    sessionId,
    autoStart: Boolean(pageId),
  });

  // Persist the session id in the URL so refresh re-opens the same row.
  useEffect(() => {
    const id = session.session?.id;
    if (!id || sessionId || !noteId || !pageId) return;
    navigate(`/notes/${noteId}/${pageId}/compose/${id}`, { replace: true });
  }, [session.session?.id, sessionId, noteId, pageId, navigate]);

  const draftedSectionsById = useMemo(
    () => indexById(Object.values(session.draftedSections)),
    [session.draftedSections],
  );

  // The displayed outline switches sources as the user progresses through
  // phases: proposal during structure → final approved outline once approved.
  // (For the editor pane preview, both are acceptable since they share `id`.)
  const outlineForPreview =
    session.phase === "completed" || session.phase === "draft"
      ? session.outlineProposal
      : session.outlineProposal;

  const handleBack = () => {
    if (noteId && pageId) {
      navigate(`/notes/${noteId}/${pageId}`);
    } else {
      navigate(-1);
    }
  };

  const handleCancel = async () => {
    await session.cancel().catch(() => undefined);
    handleBack();
  };

  if (!pageId) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Missing page id</AlertTitle>
          <AlertDescription>
            This URL is missing a page id. Use the Compose button on a wiki page to start.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const header = (
    <header
      data-testid="compose-header"
      className="border-border bg-background/95 flex items-center justify-between gap-2 border-b px-4 py-2 backdrop-blur"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleBack}
          data-testid="compose-back"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <span className="truncate text-sm font-medium">
          {session.pageSnapshot?.title || "Wiki Compose"}
        </span>
        <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {session.phase}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {session.session ? (
          <span className="text-muted-foreground hidden text-[11px] sm:inline">
            session: {session.session.id.slice(0, 8)}…
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCancel}
          data-testid="compose-cancel"
          disabled={session.status === "completed" || session.status === "cancelled"}
        >
          <X className="mr-1 h-4 w-4" />
          {session.status === "completed" ? "Close" : "Cancel"}
        </Button>
      </div>
    </header>
  );

  const left = (
    <EditorPane
      title={session.pageSnapshot?.title ?? ""}
      outline={outlineForPreview}
      draftedSections={draftedSectionsById}
      sectionBuffers={session.sectionBuffers}
      streamingSectionId={session.streamingSectionId}
      completedMarkdown={session.completedMarkdown}
    />
  );

  const right = (
    <ComposePanel
      phase={session.phase}
      isStreaming={session.isStreaming}
      briefQuestions={session.briefQuestions}
      pageSnapshot={session.pageSnapshot}
      latestBatch={session.latestBatch}
      pendingSources={session.pendingSources}
      approvedSources={session.approvedSources}
      outlineProposal={session.outlineProposal}
      activity={session.activity}
      onSubmitBrief={session.submitBrief}
      onSubmitResearchApproval={session.submitResearchApproval}
      onSubmitOutline={session.submitOutline}
    />
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col">
      {header}
      {session.error ? (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-xs">{session.error}</div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"} className="h-full">
          <ResizablePanel defaultSize={55} minSize={30}>
            {left}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            {right}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default WikiComposePage;
