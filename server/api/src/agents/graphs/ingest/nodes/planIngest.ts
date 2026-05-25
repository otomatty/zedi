/**
 * `plan_ingest` — structured ingest plan after the shared research loop (#952).
 *
 * 調査ループ完了後、クリップ記事と候補ページから merge / create / skip を決める。
 * LLM 呼び出しは `createZediChatModel` 経由（`ingestPlanner.ts` のプロンプトを再利用）。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { getOrchestratorModelId } from "../../../subgraphs/research/nodes/planQueries.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import {
  buildIngestPlannerPrompt,
  parseIngestPlanResponse,
} from "../../../../services/ingestPlanner.js";
import type { Source } from "../../../subgraphs/research/types.js";
import type { AIMessage } from "../../../../types/index.js";
import type { IngestPlannerStateType, IngestPlannerStateUpdate } from "../state.js";

const APPROVED_RESEARCH_MAX_SOURCES = 20;
const APPROVED_RESEARCH_EXCERPT_MAX = 800;

/**
 * Append HITL-approved research sources to the ingest planner user message (#952).
 * Exported for unit tests.
 */
export function appendApprovedResearchToPlannerMessages(
  messages: AIMessage[],
  approved: Source[],
): AIMessage[] {
  if (approved.length === 0) return messages;
  const block = approved
    .slice(0, APPROVED_RESEARCH_MAX_SOURCES)
    .map((s, i) => {
      const tag = s.kind === "fetched" ? "FETCHED" : s.kind === "wiki" ? "WIKI" : "WEB";
      const preview = (s.excerpt ?? s.snippet ?? "").slice(0, APPROVED_RESEARCH_EXCERPT_MAX);
      return `[${i + 1}] (${tag}) ${s.title}\n${preview || "(no preview)"}`;
    })
    .join("\n\n");
  const last = messages.at(-1);
  if (!last || last.role !== "user") return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      content: [
        last.content,
        "",
        "## APPROVED RESEARCH",
        "Use these sources when deciding merge / create / skip and when recording conflicts.",
        "",
        block,
      ].join("\n"),
    },
  ];
}

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

  const messages = appendApprovedResearchToPlannerMessages(
    buildIngestPlannerPrompt({
      article: state.article,
      candidates: state.candidates,
      userSchema: state.userSchema ?? undefined,
    }),
    state.approvedResearch,
  );

  const model = await createZediChatModel({
    modelId: getOrchestratorModelId(),
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
  const ingestPlan = parseIngestPlanResponse(JSON.stringify(raw), { validCandidateIds });

  return {
    ingestPlan,
    phase: "ingest:planned",
  };
}
