/**
 * `ComposePanel` — right pane of the Wiki Compose split view (#950).
 *
 * 分割画面の右ペイン。`PhaseStepper` (top), Dialogue / Research セクション
 * (middle), ActivitySection (bottom) を 1 つのスクロール可能カラムに積む。
 * フェーズに応じて DialogueSection と ResearchSection の表示を出し分ける。
 *
 * Stacks the stepper + phase-specific dialogue panel + activity log. The
 * actual interaction logic lives in each section component; this is just a
 * layout wrapper.
 */
import React from "react";
import { PhaseStepper } from "./PhaseStepper";
import { DialogueSection } from "./DialogueSection";
import { ResearchSection } from "./ResearchSection";
import { ConflictResolutionSection } from "./ConflictResolutionSection";
import { ActivitySection } from "./ActivitySection";
import type {
  BriefAnswer,
  BriefQuestion,
  OutlineSection,
  PageSnapshot,
  ResearchBatch,
  ResearchConflictSummary,
  ResearchSource,
} from "@/lib/wikiCompose/types";
import type { ComposeActivity, ComposePhase } from "@/hooks/wiki/useWikiComposeSession";

export interface ComposePanelProps {
  phase: ComposePhase;
  isStreaming: boolean;

  briefQuestions: BriefQuestion[];
  pageSnapshot: PageSnapshot | null;

  latestBatch: ResearchBatch | null;
  pendingSources: ResearchSource[];
  approvedSources: ResearchSource[];
  researchConflictSummary: ResearchConflictSummary | null;

  outlineProposal: OutlineSection[];

  activity: ComposeActivity[];

  onSubmitBrief: (input: {
    answers: BriefAnswer[];
    appendToExisting?: boolean;
    researchMaxIterations?: number;
  }) => Promise<void>;
  onSubmitResearchApproval: (input: {
    approvedSourceIds: string[];
    rejectedSourceIds?: string[];
    note?: string;
  }) => Promise<void>;
  onSubmitOutline: (input: { sections: OutlineSection[] }) => Promise<void>;
  onSubmitConflictAck: (input?: { note?: string }) => Promise<void>;
}

/** Right pane container. */
export const ComposePanel: React.FC<ComposePanelProps> = (props) => {
  const {
    phase,
    isStreaming,
    briefQuestions,
    pageSnapshot,
    latestBatch,
    pendingSources,
    approvedSources,
    researchConflictSummary,
    outlineProposal,
    activity,
    onSubmitBrief,
    onSubmitResearchApproval,
    onSubmitOutline,
    onSubmitConflictAck,
  } = props;

  return (
    <aside
      data-testid="compose-panel"
      className="bg-card border-border flex h-full flex-col border-l"
    >
      <header className="border-border border-b px-4 py-3">
        <PhaseStepper phase={phase} />
      </header>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        {/* Phase-specific dialogue: Brief / Structure / Draft. */}
        <DialogueSection
          phase={phase}
          briefQuestions={briefQuestions}
          pageSnapshot={pageSnapshot}
          outlineProposal={outlineProposal}
          isStreaming={isStreaming}
          onSubmitBrief={onSubmitBrief}
          onSubmitOutline={onSubmitOutline}
        />

        {phase === "conflict" && researchConflictSummary ? (
          <ConflictResolutionSection
            conflicts={researchConflictSummary}
            isStreaming={isStreaming}
            onSubmit={onSubmitConflictAck}
          />
        ) : null}

        {/* Research review: visible during research interrupt and as a
            read-only summary in later phases. */}
        {phase === "research" ||
        (phase !== "brief" && phase !== "conflict" && approvedSources.length > 0) ? (
          <ResearchSection
            batch={latestBatch}
            pendingSources={pendingSources}
            approvedSources={approvedSources}
            isReadOnly={phase !== "research"}
            isStreaming={isStreaming}
            onSubmit={onSubmitResearchApproval}
          />
        ) : null}

        <ActivitySection activity={activity} isStreaming={isStreaming} />
      </div>
    </aside>
  );
};
