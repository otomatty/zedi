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
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useWikiComposeSession } from "@/hooks/useWikiComposeSession";
import { COMPOSE_SEED_STATE_KEY, type ComposeNavigationSeed } from "@/lib/wikiCompose/navigation";
import type { DraftedSection } from "@/lib/wikiCompose/types";
import { EditorPane } from "@/components/wikiCompose/EditorPane";
import { ComposePanel } from "@/components/wikiCompose/ComposePanel";
import { useInitialComposeBackend } from "@/hooks/useInitialComposeBackend";

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

  // チャット seed は mount 時に 1 回だけ保持。`location.state` を消しても hook 側に残す。
  // Capture chat seed once on mount; survives clearing `location.state` for the hook.
  const [composeSeed] = useState((): ComposeNavigationSeed | undefined => {
    const raw = (location.state as Record<string, unknown> | null)?.[COMPOSE_SEED_STATE_KEY];
    if (!raw || typeof raw !== "object") return undefined;
    const s = raw as ComposeNavigationSeed;
    if (typeof s.outline !== "string" || typeof s.conversationText !== "string") return undefined;
    return s;
  });

  const { backend: composeBackend, isResolved: isComposeBackendResolved } =
    useInitialComposeBackend({
      enabled: !sessionId,
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
    // Resume existing session on mount; fresh compose starts after backend resolves.
    autoStart: Boolean(sessionId && pageId),
    composeSeed,
    initialInput,
    backend: composeBackend,
  });

  const awaitingComposeStart =
    !sessionId && session.status === "idle" && !session.session && !session.isStreaming;
  const autoStartRequestedRef = useRef(false);

  const startComposeSession = session.start;

  // Fresh compose: start automatically once AI settings yield a backend (#951).
  useEffect(() => {
    if (sessionId || !isComposeBackendResolved || !awaitingComposeStart) return;
    if (autoStartRequestedRef.current) return;
    autoStartRequestedRef.current = true;
    void startComposeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot auto-start when backend resolves
  }, [sessionId, isComposeBackendResolved, awaitingComposeStart]);

  // Allow manual retry after a failed auto-start (ref would otherwise block re-entry).
  useEffect(() => {
    if (sessionId || session.session || !session.error) return;
    autoStartRequestedRef.current = false;
  }, [sessionId, session.session, session.error]);

  const canRetryComposeStart =
    !sessionId &&
    Boolean(session.error) &&
    !session.session &&
    !session.isStreaming &&
    (session.status === "idle" || session.status === "failed");

  // Clear history seed only after the session row left `pending` (first run claimed).
  // `pending` のまま state を消すと失敗時リロードで chatSeed が届かなくなる (#950)。
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
      researchConflictSummary={session.researchConflictSummary}
      outlineProposal={session.outlineProposal}
      activity={session.activity}
      onSubmitBrief={session.submitBrief}
      onSubmitResearchApproval={session.submitResearchApproval}
      onSubmitConflictAck={session.submitConflictAck}
      onSubmitOutline={session.submitOutline}
      onSubmitConflictAck={session.submitConflictAck}
    />
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col">
      {header}
      {session.error ? (
        <div className="bg-destructive/10 text-destructive flex items-center justify-between gap-2 px-4 py-2 text-xs">
          <span className="min-w-0 flex-1">{session.error}</span>
          {canRetryComposeStart ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2"
              data-testid="compose-retry"
              onClick={() => void startComposeSession()}
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
