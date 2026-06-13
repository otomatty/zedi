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
import {
  composeConflictRationale,
  type ComposeContentLocale,
} from "../../../core/composeLocale.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import { conflictResumeSchema } from "../resumeSchemas.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { ResearchConflictSummary, WikiComposeInterruptPayload } from "../types.js";
import { shouldResolveResearchConflicts } from "../routing.js";

function buildConflictSummary(
  state: WikiComposeStateType,
  locale: ComposeContentLocale,
): ResearchConflictSummary {
  return {
    approved: state.approvedResearch.map((s) => ({ id: s.id, title: s.title })),
    rejected: state.rejectedResearch.map((s) => ({ id: s.id, title: s.title })),
    rationale: composeConflictRationale(locale),
  };
}

/**
 * Halts when {@link shouldResolveResearchConflicts} was true at the prior edge;
 * on resume clears the conflict flag and advances to Structure.
 */
export async function conflictResolution(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  if (!shouldResolveResearchConflicts(state)) {
    return { phase: "conflict:skipped" };
  }

  const ctx = getGraphContext(config);
  const payload: WikiComposeInterruptPayload = {
    kind: "conflict_resolution",
    conflicts: buildConflictSummary(state, ctx.contentLocale),
  };
  const resumeValue: unknown = interrupt(payload);
  conflictResumeSchema.parse(resumeValue);

  return {
    researchConflicts: [],
    phase: "conflict:resolved",
  };
}
