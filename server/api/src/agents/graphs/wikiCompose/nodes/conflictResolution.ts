/**
 * `conflict_resolution` — HITL step when research approval left conflicting
 * sources (#953).
 *
 * 調査承認で採用・却下が混在し矛盾が疑われるとき、Structure の前に 1 回だけ
 * 中断してユーザーに確認させる。resume 後は `researchConflicts` をクリアして
 * Structure へ進む。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { interrupt } from "@langchain/langgraph";
import { conflictResumeSchema } from "../resumeSchemas.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { ResearchConflictSummary, WikiComposeInterruptPayload } from "../types.js";
import { shouldResolveResearchConflicts } from "../routing.js";

function buildConflictSummary(state: WikiComposeStateType): ResearchConflictSummary {
  return {
    approved: state.approvedResearch.map((s) => ({ id: s.id, title: s.title })),
    rejected: state.rejectedResearch.map((s) => ({ id: s.id, title: s.title })),
    rationale:
      "Multiple sources were rejected while others were kept. Confirm you want to proceed " +
      "with the approved set before generating the outline.",
  };
}

/**
 * Halts when {@link shouldResolveResearchConflicts} was true at the prior edge;
 * on resume clears the conflict flag and advances to Structure.
 */
export async function conflictResolution(
  state: WikiComposeStateType,
  _config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  if (!shouldResolveResearchConflicts(state)) {
    return { phase: "conflict:skipped" };
  }

  const payload: WikiComposeInterruptPayload = {
    kind: "conflict_resolution",
    conflicts: buildConflictSummary(state),
  };
  const resumeValue: unknown = interrupt(payload);
  conflictResumeSchema.parse(resumeValue);

  return {
    researchConflicts: [],
    phase: "conflict:resolved",
  };
}
