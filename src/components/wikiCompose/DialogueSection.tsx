/**
 * `DialogueSection` — Brief / Structure interaction panel (#950).
 *
 * Compose 画面右ペインの「対話」セクション。フェーズに応じて Brief の質問カード
 * 群、Structure のアウトラインエディタ、Draft 中のセクション進捗を出し分ける。
 * Compose は free-form chat ではないため、各フェーズの UI は専用フォーム形式。
 *
 * Pure presentational shell that routes between the BriefQuestionCard list,
 * OutlineEditor, and the section progress view based on `phase`. Submit
 * handlers come from the parent (`WikiComposePage` → `useWikiComposeSession`).
 */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardContent, CardHeader, CardTitle, Slider } from "@zedi/ui";
import { Sparkles, RefreshCw, ArrowRight } from "lucide-react";
import type {
  BriefAnswer,
  BriefQuestion,
  OutlineSection,
  PageSnapshot,
} from "@/lib/wikiCompose/types";
import { BriefQuestionCard } from "./BriefQuestionCard";
import { OutlineEditor } from "./OutlineEditor";
import type { ComposePhase } from "@/hooks/wiki/useWikiComposeSession";

export interface DialogueSectionProps {
  phase: ComposePhase;
  briefQuestions: BriefQuestion[];
  pageSnapshot: PageSnapshot | null;
  outlineProposal: OutlineSection[];
  isStreaming: boolean;
  /** Brief submission. */
  onSubmitBrief: (input: {
    answers: BriefAnswer[];
    appendToExisting?: boolean;
    researchMaxIterations?: number;
  }) => Promise<void>;
  /** Structure submission. */
  onSubmitOutline: (input: { sections: OutlineSection[] }) => Promise<void>;
}

/** Whether all required questions have at least one answer. */
function allRequiredAnswered(
  questions: BriefQuestion[],
  answers: Record<string, BriefAnswer>,
): boolean {
  return questions
    .filter((q) => q.required)
    .every((q) => {
      const a = answers[q.id];
      if (!a) return false;
      const hasOption = (a.selectedOptionIds ?? []).length > 0;
      const hasText = Boolean(a.freeText && a.freeText.trim().length > 0);
      return hasOption || hasText;
    });
}

/** Container for Brief / Structure / Draft dialogue UIs. */
export const DialogueSection: React.FC<DialogueSectionProps> = ({
  phase,
  briefQuestions,
  pageSnapshot,
  outlineProposal,
  isStreaming,
  onSubmitBrief,
  onSubmitOutline,
}) => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, BriefAnswer>>({});
  const [appendToExisting, setAppendToExisting] = useState<boolean>(
    Boolean(pageSnapshot?.hasContent),
  );
  const [maxIterations, setMaxIterations] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);

  const canSubmitBrief = useMemo(
    () => allRequiredAnswered(briefQuestions, answers),
    [briefQuestions, answers],
  );

  if (phase === "brief") {
    return (
      <section data-testid="dialogue-brief" className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4" aria-hidden /> {t("wikiCompose.brief.title")}
          </h2>
          <span className="text-muted-foreground text-xs">
            {briefQuestions.length === 0
              ? t("wikiCompose.brief.noQuestions")
              : t("wikiCompose.brief.questionCount", { count: briefQuestions.length })}
          </span>
        </header>

        {briefQuestions.length === 0 && isStreaming ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-center text-xs">
              {t("wikiCompose.brief.preparing")}
            </CardContent>
          </Card>
        ) : null}

        {briefQuestions.map((q) => (
          <BriefQuestionCard
            key={q.id}
            question={q}
            answer={answers[q.id] ?? null}
            onChange={(next) => setAnswers((prev) => ({ ...prev, [q.id]: next }))}
          />
        ))}

        {pageSnapshot?.hasContent ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs tracking-wide uppercase">
                {t("wikiCompose.brief.existingContentTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  data-testid="append-radio-true"
                  checked={appendToExisting}
                  onChange={() => setAppendToExisting(true)}
                />
                {t("wikiCompose.brief.append")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  data-testid="append-radio-false"
                  checked={!appendToExisting}
                  onChange={() => setAppendToExisting(false)}
                />
                {t("wikiCompose.brief.replace")}
              </label>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs tracking-wide uppercase">
              {t("wikiCompose.brief.researchDepthTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>{t("wikiCompose.brief.researchQuick")}</span>
              <span data-testid="research-iterations-value" className="text-foreground font-medium">
                {t("wikiCompose.brief.iterationCount", { count: maxIterations })}
              </span>
              <span>{t("wikiCompose.brief.researchDeep")}</span>
            </div>
            <Slider
              data-testid="research-iterations-slider"
              min={1}
              max={5}
              step={1}
              value={[maxIterations]}
              onValueChange={(v) => setMaxIterations(v[0] ?? 3)}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            data-testid="submit-brief"
            disabled={!canSubmitBrief || submitting || isStreaming}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmitBrief({
                  answers: Object.values(answers),
                  appendToExisting,
                  researchMaxIterations: maxIterations,
                });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? (
              <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1 h-4 w-4" />
            )}
            {t("wikiCompose.brief.startResearch")}
          </Button>
        </div>
      </section>
    );
  }

  if (phase === "structure") {
    return (
      <section data-testid="dialogue-structure" className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("wikiCompose.structure.title")}</h2>
          <span className="text-muted-foreground text-xs">
            {t("wikiCompose.structure.sectionCount", { count: outlineProposal.length })}
          </span>
        </header>
        <OutlineEditor
          initialSections={outlineProposal}
          disabled={submitting || isStreaming}
          onSubmit={async (sections) => {
            setSubmitting(true);
            try {
              await onSubmitOutline({ sections });
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </section>
    );
  }

  if (phase === "draft" || phase === "completed") {
    return (
      <section data-testid="dialogue-draft" className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold">
            {phase === "completed"
              ? t("wikiCompose.draft.completed")
              : t("wikiCompose.draft.drafting")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {phase === "completed"
              ? t("wikiCompose.draft.completedHint")
              : t("wikiCompose.draft.draftingHint")}
          </p>
        </header>
      </section>
    );
  }

  // research phase — handled in ResearchSection; nothing to render here.
  return null;
};
