/**
 * `BriefQuestionCard` — one structured Brief question (#950).
 *
 * Brief フェーズで Orchestrator が生成した 1 件の質問カード。チップ式選択肢 +
 * 任意のフリーテキストを統合した入出力 UI。`required` の質問は未回答だと
 * `Submit` ボタンが無効化される（親側で判定）。
 *
 * Renders one question with optional answer chips and a free-text addendum
 * box. Multi-select is supported; the parent owns the answer state.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input } from "@zedi/ui";
import type { BriefAnswer, BriefQuestion } from "@/lib/wikiCompose/types";

export interface BriefQuestionCardProps {
  question: BriefQuestion;
  answer: BriefAnswer | null;
  onChange: (next: BriefAnswer) => void;
}

/** Toggles a single option id in the current selection. */
function toggleOption(selected: string[], optionId: string): string[] {
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
}

/** Render one Brief question card. */
export const BriefQuestionCard: React.FC<BriefQuestionCardProps> = ({
  question,
  answer,
  onChange,
}) => {
  const { t } = useTranslation();
  const selected = answer?.selectedOptionIds ?? [];
  const freeText = answer?.freeText ?? "";

  return (
    <Card data-testid={`brief-card-${question.id}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-start gap-2 text-sm leading-snug font-medium">
          <span className="flex-1">{question.question}</span>
          {question.required ? (
            <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
              {t("wikiCompose.brief.required")}
            </Badge>
          ) : null}
        </CardTitle>
        {question.rationale ? (
          <p className="text-muted-foreground text-xs">{question.rationale}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {question.options.length > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t("wikiCompose.brief.answerOptionsAria")}
          >
            {question.options.map((option) => {
              const active = selected.includes(option.id);
              return (
                <button
                  type="button"
                  key={option.id}
                  data-testid={`brief-option-${option.id}`}
                  aria-pressed={active}
                  onClick={() =>
                    onChange({
                      questionId: question.id,
                      selectedOptionIds: toggleOption(selected, option.id),
                      freeText: freeText || undefined,
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border text-foreground",
                  )}
                  title={option.hint}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <Input
          type="text"
          placeholder={
            question.options.length > 0
              ? t("wikiCompose.brief.freeTextWithOptions")
              : t("wikiCompose.brief.freeTextOnly")
          }
          data-testid={`brief-freetext-${question.id}`}
          value={freeText}
          onChange={(e) =>
            onChange({
              questionId: question.id,
              selectedOptionIds: selected,
              freeText: e.target.value || undefined,
            })
          }
        />
      </CardContent>
    </Card>
  );
};
