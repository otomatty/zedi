/**
 * Formats approved research + latest batch evaluation for the ingest planner prompt.
 */
import type { IngestPlannerStateType } from "../state.js";

/**
 * Build a markdown block summarizing research loop output for `plan_ingest`.
 */
export function formatResearchForIngest(state: IngestPlannerStateType): string {
  const lines: string[] = [];

  if (state.approvedResearch.length > 0) {
    lines.push("## APPROVED RESEARCH SOURCES");
    for (const s of state.approvedResearch) {
      const loc = s.url ?? s.finalUrl ?? (s.pageId ? `wiki:${s.pageId}` : s.id);
      lines.push(`- [${s.id}] ${s.title} (${s.kind}) ${loc}`);
      const preview = s.excerpt ?? s.snippet;
      if (preview) {
        lines.push(`  preview: ${preview.slice(0, 400)}`);
      }
    }
  }

  const latest = state.batches[state.batches.length - 1];
  if (latest?.evaluation) {
    lines.push("", "## RESEARCH EVALUATION (latest batch)");
    lines.push(`score: ${latest.evaluation.score}`);
    lines.push(`rationale: ${latest.evaluation.rationale}`);
    if (latest.evaluation.missingAspects?.length) {
      lines.push(`missing: ${latest.evaluation.missingAspects.join("; ")}`);
    }
  }

  if (lines.length === 0) return "";
  return `\n\n${lines.join("\n")}`;
}
