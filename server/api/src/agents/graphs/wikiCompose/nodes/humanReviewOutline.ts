/**
 * `human_review_outline` — Wiki Compose Structure interrupt node (#950).
 *
 * Orchestrator が提案したアウトラインを `interrupt(value)` でユーザーに渡し、
 * `outlineResumeSchema` で検証して `approvedOutline` を state に確定する。
 * ユーザーは並び替え・タイトル変更・depth 変更・サブセクション削除が可能
 * （フロントの outline editor で全部行う）。承認後は Draft フェーズへ。
 *
 * Halts at the outline interrupt and projects the user-edited outline back
 * into state. Validation throws on empty outlines so Draft cannot be entered
 * with nothing to write.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { interrupt } from "@langchain/langgraph";
import { outlineResumeSchema } from "../resumeSchemas.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { ApprovedOutline, WikiComposeInterruptPayload } from "../types.js";

/** `human_review_outline` node — interrupt + resume projection. */
export async function humanReviewOutline(
  state: WikiComposeStateType,
  _config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const payload: WikiComposeInterruptPayload = {
    kind: "human_review_outline",
    outline: state.outlineProposal,
    approvedSources: state.approvedResearch,
  };
  const resumeValue: unknown = interrupt(payload);
  const parsed = outlineResumeSchema.parse(resumeValue);

  const approvedOutline: ApprovedOutline = {
    sections: parsed.sections.map((s) => ({
      id: s.id,
      heading: s.heading,
      depth: s.depth,
      intent: s.intent,
      ...(s.sourceIds !== undefined ? { sourceIds: s.sourceIds } : {}),
    })),
  };

  return {
    approvedOutline,
    phase: "structure:completed",
  };
}
