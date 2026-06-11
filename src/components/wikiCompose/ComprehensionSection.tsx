/**
 * `ComprehensionSection` — Understanding Layer panel for Wiki Compose.
 *
 * 完成した記事から導出した理解支援を、ブロッキングせずに提示する非同期レイヤー。
 * TL;DR 要約・キーワード用語集・自己確認用の理解度チェック（能動想起）を表示し、
 * 「即座に本文が出るストレスの無さ」と「理解度の向上」を両立させる。
 *
 * Non-blocking panel that surfaces a TL;DR, a key-term glossary, and self-check
 * comprehension questions derived from the completed article. The questions use
 * a local checklist (active recall) so the reader engages instead of skimming.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, HelpCircle, Sparkles } from "lucide-react";
import { cn } from "@zedi/ui";
import type { ComprehensionAids } from "@/lib/wikiCompose/types";

/**
 * Props for {@link ComprehensionSection}.
 * {@link ComprehensionSection} の props。
 */
export interface ComprehensionSectionProps {
  /** Understanding Layer scaffolds to render. 表示する理解支援スキャフォールド。 */
  aids: ComprehensionAids;
}

/** Render the Understanding Layer. Returns null when there is nothing to show. */
export const ComprehensionSection: React.FC<ComprehensionSectionProps> = ({ aids }) => {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const hasSummary = aids.summary.trim().length > 0;
  const hasTerms = aids.keyTerms.length > 0;
  const hasQuestions = aids.questions.length > 0;
  if (!hasSummary && !hasTerms && !hasQuestions) return null;

  return (
    <section
      data-testid="comprehension-section"
      className="border-border rounded-md border bg-emerald-50/40 p-3 dark:bg-emerald-950/20"
    >
      <header className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold">{t("wikiCompose.comprehension.title")}</h3>
      </header>

      {hasSummary ? (
        <div data-testid="comprehension-summary" className="mb-3">
          <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
            {t("wikiCompose.comprehension.summary")}
          </p>
          <p className="text-sm leading-relaxed">{aids.summary}</p>
        </div>
      ) : null}

      {hasTerms ? (
        <div className="mb-3">
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
            <BookOpen className="h-3 w-3" />
            {t("wikiCompose.comprehension.keyTerms")}
          </p>
          <dl className="space-y-1.5">
            {aids.keyTerms.map((term, i) => (
              <div key={`${term.term}-${i}`} data-testid={`comprehension-term-${i}`}>
                <dt className="text-sm font-medium">{term.term}</dt>
                <dd className="text-muted-foreground text-xs leading-relaxed">{term.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {hasQuestions ? (
        <div>
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase">
            <HelpCircle className="h-3 w-3" />
            {t("wikiCompose.comprehension.selfCheck")}
          </p>
          <ul className="space-y-1">
            {aids.questions.map((q, i) => (
              <li key={`q-${i}`}>
                <button
                  type="button"
                  data-testid={`comprehension-question-${i}`}
                  aria-pressed={Boolean(checked[i])}
                  onClick={() => setChecked((prev) => ({ ...prev, [i]: !prev[i] }))}
                  className={cn(
                    "flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors",
                    "hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30",
                    checked[i] && "text-muted-foreground line-through",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      checked[i]
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {checked[i] ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">{q}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
