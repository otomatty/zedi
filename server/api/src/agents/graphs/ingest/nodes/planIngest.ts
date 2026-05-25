/**
 * `plan_ingest` — structured ingest plan after the shared research loop (#952).
 *
 * 調査ループ完了後、クリップ記事と候補ページから merge / create / skip を決める。
 * LLM 呼び出しは `createZediChatModel` 経由（`ingestPlanner.ts` のプロンプトを再利用）。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveComposeModelId } from "../../../core/llm/resolveComposeModelId.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import {
  buildIngestPlannerPrompt,
  parseIngestPlanValue,
} from "../../../../services/ingestPlanner.js";
import type { IngestPlannerStateType, IngestPlannerStateUpdate } from "../state.js";
import { formatResearchForIngest } from "./formatResearchForIngest.js";

const ingestPlanSchema = z.object({
  action: z.enum(["merge", "create", "skip"]),
  reason: z.string().min(1),
  targetPageId: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  conflicts: z
    .array(
      z.object({
        claim: z.string().min(1),
        existing: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Produce {@link IngestPlan} via ZediChatModel after research completes.
 */
export async function planIngest(
  state: IngestPlannerStateType,
  config: LangGraphRunnableConfig,
): Promise<IngestPlannerStateUpdate> {
  const ctx = getGraphContext(config);
  if (!state.article) {
    throw new Error("plan_ingest: article is missing from state");
  }

  const messages = buildIngestPlannerPrompt({
    article: state.article,
    candidates: state.candidates,
    userSchema: state.userSchema ?? undefined,
  });
  const researchBlock = formatResearchForIngest(state);
  if (researchBlock.length > 0) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      last.content = `${last.content}${researchBlock}`;
    } else {
      messages.push({ role: "user", content: researchBlock.trimStart() });
    }
  }

  const modelId = await resolveComposeModelId("orchestrator", ctx.backend, ctx.tier, ctx.db);
  const model = await createZediChatModel({
    modelId,
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:plan_ingest`,
    backend: ctx.backend,
    temperature: 0.2,
    maxTokens: 1024,
  });

  const structured = model.withStructuredOutput(ingestPlanSchema, { name: "plan_ingest" });
  const raw = await structured.invoke(messages.map((m) => ({ role: m.role, content: m.content })));

  const validCandidateIds = new Set(state.candidates.map((c) => c.id));
  const ingestPlan = parseIngestPlanValue(raw, { validCandidateIds });

  return {
    ingestPlan,
    phase: "ingest:planned",
  };
}
