/**
 * `ConflictResolutionSection` — P5 research conflict acknowledgment (#953).
 *
 * 調査承認で採用・却下が混在したときの確認 UI。承認セットで Structure へ進む。
 *
 * Shown when the graph interrupts at `conflict_resolution`. The user
 * acknowledges and resumes with `{ acknowledged: true }`.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@zedi/ui";
import { AlertTriangle } from "lucide-react";
import type { ResearchConflictSummary } from "@/lib/wikiCompose/types";

/**
 * Props for the conflict acknowledgment panel.
 * 矛盾解消確認パネルの props。
 */
export interface ConflictResolutionSectionProps {
  conflicts: ResearchConflictSummary;
  isStreaming: boolean;
  onSubmit: (input?: { note?: string }) => Promise<void>;
}

/**
 * Conflict acknowledgment panel between Research and Structure.
 * Research と Structure の間で表示する矛盾解消確認パネル。
 */
export const ConflictResolutionSection: React.FC<ConflictResolutionSectionProps> = ({
  conflicts,
  isStreaming,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  return (
    <section data-testid="dialogue-conflict" className="space-y-3">
      <header className="flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        {t("wikiCompose.conflict.title")}
      </header>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("wikiCompose.conflict.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <p className="text-muted-foreground">{conflicts.rationale}</p>
          <div>
            <p className="font-medium">
              {t("wikiCompose.conflict.approved", { count: conflicts.approved.length })}
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc">
              {conflicts.approved.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">
              {t("wikiCompose.conflict.rejected", { count: conflicts.rejected.length })}
            </p>
            <ul className="text-muted-foreground mt-1 list-inside list-disc">
              {conflicts.rejected.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isStreaming || submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {t("wikiCompose.conflict.continue")}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
};
