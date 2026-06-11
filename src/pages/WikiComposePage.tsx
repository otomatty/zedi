/**
 * `WikiComposePage` — Wiki Compose split-screen UI (#950).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { useWikiComposeSession } from "@/hooks/wiki/useWikiComposeSession";
import { COMPOSE_SEED_STATE_KEY, type ComposeNavigationSeed } from "@/lib/wikiCompose/navigation";
import type { ComposeMode, DraftedSection } from "@/lib/wikiCompose/types";
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
  const { t } = useTranslation();
  const params = useParams<{ noteId: string; pageId: string; sessionId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const noteId = params.noteId ?? "";
  const pageId = params.pageId ?? "";
  const sessionId = params.sessionId ?? null;

  // Default to the zero-friction instant draft; `?mode=guided` opts into the
  // classic human-in-the-loop flow (Brief → Research → Outline gates).
  // 既定は即時ドラフト。`?mode=guided` で従来の対話フローに切り替える。
  const mode: ComposeMode =
    new URLSearchParams(location.search).get("mode") === "guided" ? "guided" : "instant";

  const [composeSeed] = useState((): ComposeNavigationSeed | undefined => {
    const raw = (location.state as Record<string, unknown> | null)?.[COMPOSE_SEED_STATE_KEY];
    if (!raw || typeof raw !== "object") return undefined;
    const s = raw as ComposeNavigationSeed;
    if (typeof s.outline !== "string" || typeof s.conversationText !== "string") return undefined;
    return s;
  });

  const initialInput = useMemo(
    () =>
      composeSeed
        ? {
            chatSeed: {
              outline: composeSeed.outline,
              conversationText: composeSeed.conversationText,
              userSchema: composeSeed.userSchema,
              conversationId: composeSeed.conversationId,
            },
          }
        : undefined,
    [composeSeed],
  );

  const session = useWikiComposeSession({
    pageId,
    sessionId,
    startPolicy: sessionId ? "on-mount" : "when-backend-ready",
    composeSeed,
    initialInput,
    mode,
  });

  useEffect(() => {
    if (!composeSeed || !location.state) return;
    if (session.status === "idle" || session.status === "pending") return;
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: null,
    });
  }, [
    composeSeed,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    session.status,
  ]);

  useEffect(() => {
    const id = session.session?.id;
    if (!id || sessionId || !noteId || !pageId) return;
    navigate(`/notes/${noteId}/${pageId}/compose/${id}`, { replace: true });
  }, [session.session?.id, sessionId, noteId, pageId, navigate]);

  const draftedSectionsById = useMemo(
    () => indexById(Object.values(session.draftedSections)),
    [session.draftedSections],
  );

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

  const phaseLabel = (() => {
    const key = `wikiCompose.phaseDisplay.${session.phase}` as const;
    const translated = t(key);
    return translated === key ? session.phase : translated;
  })();

  if (!pageId) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{t("wikiCompose.page.missingPageIdTitle")}</AlertTitle>
          <AlertDescription>{t("wikiCompose.page.missingPageIdDescription")}</AlertDescription>
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
          {t("wikiCompose.page.back")}
        </Button>
        <span className="truncate text-sm font-medium">
          {session.pageSnapshot?.title || t("wikiCompose.page.titleFallback")}
        </span>
        <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
          {phaseLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {session.session ? (
          <span className="text-muted-foreground hidden text-[11px] sm:inline">
            {t("wikiCompose.page.sessionPrefix")} {session.session.id.slice(0, 8)}…
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
          {session.status === "completed"
            ? t("wikiCompose.page.close")
            : t("wikiCompose.page.cancel")}
        </Button>
      </div>
    </header>
  );

  const left = (
    <EditorPane
      title={session.pageSnapshot?.title ?? ""}
      outline={session.outlineProposal}
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
      researchConflictSummary={session.researchConflictSummary}
      outlineProposal={session.outlineProposal}
      comprehensionAids={session.comprehensionAids}
      activity={session.activity}
      onSubmitBrief={session.submitBrief}
      onSubmitResearchApproval={session.submitResearchApproval}
      onSubmitConflictAck={session.submitConflictAck}
      onSubmitOutline={session.submitOutline}
    />
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col">
      {header}
      {session.error ? (
        <div className="bg-destructive/10 text-destructive flex items-center justify-between gap-2 px-4 py-2 text-xs">
          <span className="min-w-0 flex-1">{session.error}</span>
          {session.canRetryStart ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2"
              data-testid="compose-retry"
              onClick={() => void session.start()}
            >
              {t("common:retry")}
            </Button>
          ) : null}
        </div>
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
