/**
 * `ResearchConflictSection` — P5 conflict-resolution HITL (#953).
 *
 * Shown when the orchestrator halts after research approval with many rejections.
 * User must acknowledge before Structure / outline generation continues.
 */
import React, { useState } from "react";
import { Button } from "@zedi/ui";
import type { ResearchConflictSummary } from "@/lib/wikiCompose/types";

export interface ResearchConflictSectionProps {
  conflicts: ResearchConflictSummary;
  isStreaming: boolean;
  onAcknowledge: () => Promise<void>;
}

/** Conflict acknowledgement panel. */
export const ResearchConflictSection: React.FC<ResearchConflictSectionProps> = ({
  conflicts,
  isStreaming,
  onAcknowledge,
}) => {
  const [submitting, setSubmitting] = useState(false);

  return (
    <section data-testid="research-conflict-section" className="space-y-3">
      <p className="text-sm font-medium">Review conflicting sources</p>
      <p className="text-muted-foreground text-xs">{conflicts.rationale}</p>
      <div className="space-y-2 text-xs">
        <div>
          <span className="font-medium">Approved ({conflicts.approved.length})</span>
          <ul className="text-muted-foreground mt-1 list-inside list-disc">
            {conflicts.approved.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="font-medium">Rejected ({conflicts.rejected.length})</span>
          <ul className="text-muted-foreground mt-1 list-inside list-disc">
            {conflicts.rejected.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        type="button"
        data-testid="research-conflict-ack"
        disabled={isStreaming || submitting}
        onClick={() => {
          setSubmitting(true);
          void onAcknowledge().finally(() => setSubmitting(false));
        }}
      >
        Continue with approved sources
      </Button>
    </section>
  );
};
