/**
 * `WikiComposePage` — Wiki Compose split-screen UI (#950).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, PencilLine, X } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useIsMobile,
} from "@zedi/ui";
import { useWikiComposeSession, type ComposePhase } from "@/hooks/wiki/useWikiComposeSession";
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

/**
 * Which pane the mobile single-column view shows.
 * モバイル 1 カラム表示でどちらのペインを出すか。
 */
type MobileComposeView = "preview" | "compose";

/**
 * Pick the most relevant mobile pane for a phase: drafting/completed favour the
 * live preview (left), while interrupt phases need the compose controls (right).
 *
 * フェーズに応じて初期表示ペインを選ぶ。執筆中・完了はプレビュー（左）、入力が
 * 必要な割込みフェーズは作成パネル（右）を出す。
 */
function phaseToMobileView(phase: ComposePhase): MobileComposeView {
  switch (phase) {
    case "draft":
    case "completed":
      return "preview";
    case "brief":
    case "research":
    case "conflict":
    case "structure":
      return "compose";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

const MOBILE_TAB_BASE =
  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";

/**
 * Mobile-only segmented control that toggles between the preview and compose
 * panes (the desktop shows both side by side via resizable panels).
 *
 * モバイル専用のセグメント切替。プレビューと作成パネルを行き来する
 * （デスクトップはリサイズ可能な分割で両方を同時表示する）。
 */
const ComposePaneTabs: React.FC<{
  view: MobileComposeView;
  onChange: (view: MobileComposeView) => void;
}> = ({ view, onChange }) => {
  const { t } = useTranslation();
  return (
    <div
      data-testid="compose-mobile-tabs"
      role="tablist"
      aria-label={t("wikiCompose.page.paneSwitchAria")}
      className="border-border bg-background/95 flex items-center gap-1 border-b px-2 py-1.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "preview"}
        data-testid="compose-tab-preview"
        onClick={() => onChange("preview")}
        className={cn(
          MOBILE_TAB_BASE,
          view === "preview"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Eye className="h-4 w-4" aria-hidden />
        {t("wikiCompose.page.tabPreview")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "compose"}
        data-testid="compose-tab-compose"
        onClick={() => onChange("compose")}
        className={cn(
          MOBILE_TAB_BASE,
          view === "compose"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <PencilLine className="h-4 w-4" aria-hidden />
        {t("wikiCompose.page.tabCompose")}
      </button>
    </div>
  );
};

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

  // Mobile shows one pane at a time; auto-follow the phase so the user lands on
  // the pane that matters (controls during interrupts, preview while drafting),
  // while still allowing manual switching via the tab bar. The phase is adjusted
  // during render (the "you might not need an effect" pattern) so the switch is
  // applied without a flash and without calling setState inside an effect.
  // モバイルは 1 ペイン表示。フェーズに追従して必要なペインへ自動で切り替えつつ、
  // タブで手動切替もできるようにする。フェーズ変化はレンダー中に反映する
  // （effect 内 setState を避ける React 推奨パターン）。
  const [mobileView, setMobileView] = useState<MobileComposeView>(() =>
    phaseToMobileView(session.phase),
  );
  const [trackedPhase, setTrackedPhase] = useState<ComposePhase>(session.phase);
  if (trackedPhase !== session.phase) {
    setTrackedPhase(session.phase);
    setMobileView(phaseToMobileView(session.phase));
  }

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
      {isMobile ? (
        <>
          <ComposePaneTabs view={mobileView} onChange={setMobileView} />
          <div className="min-h-0 flex-1">
            {/* Keep both panes mounted (toggle with `hidden`) so in-progress
                Brief answers and outline edits survive tab switches.
                両ペインをマウントしたまま `hidden` で切替え、入力途中の
                Brief 回答やアウトライン編集をタブ切替で失わないようにする。 */}
            <div className={cn("h-full", mobileView === "preview" ? "block" : "hidden")}>
              {left}
            </div>
            <div className={cn("h-full", mobileView === "compose" ? "block" : "hidden")}>
              {right}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={55} minSize={30}>
              {left}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={25}>
              {right}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
};

export default WikiComposePage;
