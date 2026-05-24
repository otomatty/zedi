/**
 * `ResearchSection` — research source review panel (#950).
 *
 * 調査ループ完了後、`human_review_research` interrupt 中にユーザーに表示する
 * ソース個別採用 UI。各ソースに対して採用 / 除外を切り替え、最後に
 * 「Approve selected」で graph を再開する。`approvedSources` が確定済みの場合は
 * 読み取り専用のサマリ表示にフォールバック。
 *
 * Per-source approve/reject UI. Cards show source title + URL/snippet/excerpt
 * preview; the user toggles each row, then submits the approved + rejected
 * id sets to `submitResearchApproval`.
 */
import React, { useEffect, useState } from "react";
import { ExternalLink, Check } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@zedi/ui";
import { cn } from "@zedi/ui";
import type { ResearchBatch, ResearchSource } from "@/lib/wikiCompose/types";

type Decision = "approved" | "rejected" | "pending";

export interface ResearchSectionProps {
  batch: ResearchBatch | null;
  pendingSources: ResearchSource[];
  approvedSources: ResearchSource[];
  isReadOnly: boolean;
  isStreaming: boolean;
  onSubmit: (input: {
    approvedSourceIds: string[];
    rejectedSourceIds?: string[];
    note?: string;
  }) => Promise<void>;
}

/** Maps source kind to a short label. */
function kindLabel(kind: ResearchSource["kind"]): string {
  switch (kind) {
    case "web":
      return "Web";
    case "wiki":
      return "Wiki";
    case "fetched":
      return "Article";
  }
}

/** Render the research review panel. */
export const ResearchSection: React.FC<ResearchSectionProps> = ({
  batch,
  pendingSources,
  approvedSources,
  isReadOnly,
  isStreaming,
  onSubmit,
}) => {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [submitting, setSubmitting] = useState(false);

  // Seed decisions to "approved" by default when sources change so the user
  // can review and reject rather than starting from scratch.
  // pendingSources の初期 decision は approved を default とする。
  useEffect(() => {
    setDecisions((prev) => {
      const next: Record<string, Decision> = { ...prev };
      for (const s of pendingSources) {
        if (next[s.id] === undefined) next[s.id] = "approved";
      }
      return next;
    });
  }, [pendingSources]);

  const setDecision = (id: string, d: Decision) => setDecisions((prev) => ({ ...prev, [id]: d }));

  const handleSubmit = async () => {
    const approvedSourceIds: string[] = [];
    const rejectedSourceIds: string[] = [];
    for (const s of pendingSources) {
      const d = decisions[s.id] ?? "approved";
      if (d === "approved") approvedSourceIds.push(s.id);
      else if (d === "rejected") rejectedSourceIds.push(s.id);
    }
    setSubmitting(true);
    try {
      await onSubmit({ approvedSourceIds, rejectedSourceIds });
    } finally {
      setSubmitting(false);
    }
  };

  // Read-only view: show approved sources after the user has resumed.
  // 確定済みソースの表示モード。
  if (isReadOnly) {
    if (approvedSources.length === 0) {
      return (
        <section data-testid="research-section-readonly" className="text-muted-foreground text-xs">
          No research sources were approved.
        </section>
      );
    }
    return (
      <section data-testid="research-section-readonly" className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Research <Badge variant="secondary">{approvedSources.length} approved</Badge>
        </h2>
        <ul className="space-y-1.5">
          {approvedSources.map((s) => (
            <li
              key={s.id}
              className="bg-muted/30 flex items-start gap-2 rounded-md border p-2 text-xs"
            >
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title}</div>
                {s.url || s.finalUrl ? (
                  <a
                    href={s.finalUrl ?? s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 truncate"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{s.finalUrl ?? s.url}</span>
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (pendingSources.length === 0) {
    return (
      <section data-testid="research-section-empty" className="text-muted-foreground text-xs">
        {isStreaming
          ? "Research in progress — sources will appear when ready."
          : "No research sources to review."}
      </section>
    );
  }

  const approvedCount = pendingSources.filter(
    (s) => (decisions[s.id] ?? "approved") === "approved",
  ).length;

  return (
    <section data-testid="research-section-review" className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Research review
          {batch ? <Badge variant="outline">iter {batch.iteration + 1}</Badge> : null}
        </h2>
        <span className="text-muted-foreground text-xs">
          {approvedCount} / {pendingSources.length} approved
        </span>
      </header>

      <ul className="space-y-2">
        {pendingSources.map((s) => {
          const d = decisions[s.id] ?? "approved";
          return (
            <Card
              key={s.id}
              data-testid={`source-row-${s.id}`}
              className={cn(
                "transition-colors",
                d === "approved" && "border-emerald-300 dark:border-emerald-700/60",
                d === "rejected" && "opacity-60",
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start gap-2 text-sm leading-snug font-medium">
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {kindLabel(s.kind)}
                  </Badge>
                  <span className="flex-1 break-words">{s.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.url || s.finalUrl ? (
                  <a
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs break-all"
                    href={s.finalUrl ?? s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {s.finalUrl ?? s.url}
                  </a>
                ) : null}
                {s.excerpt || s.snippet ? (
                  <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
                    {s.excerpt ?? s.snippet}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={d === "approved" ? "default" : "outline"}
                    size="sm"
                    data-testid={`source-approve-${s.id}`}
                    onClick={() => setDecision(s.id, "approved")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant={d === "rejected" ? "destructive" : "outline"}
                    size="sm"
                    data-testid={`source-reject-${s.id}`}
                    onClick={() => setDecision(s.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="research-submit"
          disabled={submitting || isStreaming}
          onClick={handleSubmit}
        >
          <Check className="mr-1 h-4 w-4" /> Continue with selection
        </Button>
      </div>
    </section>
  );
};
