/**
 * `refine_queries` — replaces `queries` with a refined batch based on the
 * latest evaluation's `missingAspects`. Loops back to `web_search`.
 *
 * 直近 evaluation の `missingAspects` を基に次ループのクエリを生成し、
 * `queries` を全置換する。`iteration` は `evaluate_sufficiency` で既に
 * post-increment 済みなので、ここでは触らない。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveComposeModelId } from "../../../core/llm/resolveComposeModelId.js";
import { getGraphContext } from "./shared/getGraphContext.js";
import { dispatchResearchIteration } from "./shared/dispatchSseCustom.js";
import { planQueriesSchema } from "./planQueries.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
import type { PlannedQuery } from "../types.js";

const SYSTEM_PROMPT =
  "You are refining a research query plan. Given the previous queries, the " +
  "sources gathered, and the missing aspects flagged by evaluation, propose " +
  "1-6 NEW queries that fill those gaps. Avoid repeating prior queries. " +
  "Each query MUST specify at least one channel from ['web','wiki']. " +
  "Output JSON only.";

function buildUserPrompt(state: ResearchLoopStateType): string {
  const evaluation = state.lastEvaluation;
  const missing = evaluation?.missingAspects ?? [];
  const prior = state.queries.map((q) => `- ${q.query} (${q.channels.join("/")})`);
  const sourceTitles = state.pendingSources.map((s) => `- [${s.kind}] ${s.title}`);
  return [
    `[Iteration ${state.iteration} / ${state.maxIterations}]`,
    `Previous evaluation score: ${evaluation?.score ?? "n/a"}`,
    "",
    "[Missing aspects to address]",
    ...(missing.length ? missing.map((m) => `- ${m}`) : ["(none flagged; broaden coverage)"]),
    "",
    "[Prior queries (avoid duplicates)]",
    ...prior,
    "",
    `[Sources gathered so far: ${state.pendingSources.length}]`,
    ...sourceTitles,
  ].join("\n");
}

/**
 * `refine_queries` node — replaces `state.queries` with a fresh batch that
 * addresses `lastEvaluation.missingAspects`, then dispatches
 * `research_iteration { status: "refined" }`. Loops back to the search
 * fan-out via the graph edge.
 *
 * リファインノード本体。直近の評価結果を元に次イテレーションのクエリを生成する。
 *
 * @param state  Current research-loop state.
 * @param config LangGraph runnable config (carries `GraphContext` + callbacks).
 * @returns Partial state update: `{ queries: newQueries, phase }`.
 */
export async function refineQueries(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const ctx = getGraphContext(config);

  const modelId = await resolveComposeModelId("orchestrator", ctx.backend, ctx.tier, ctx.db);
  const model = await createZediChatModel({
    modelId,
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:refine`,
    backend: ctx.backend,
    temperature: 0.5,
    maxTokens: 1024,
  });
  const structured = model.withStructuredOutput(planQueriesSchema, { name: "refine_queries" });
  const planned = await structured.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(state) },
  ]);
  const queries: PlannedQuery[] = planned.queries.map((q) => ({
    id: randomUUID(),
    query: q.query,
    rationale: q.rationale,
    channels: q.channels,
  }));

  await dispatchResearchIteration(
    { iteration: state.iteration, status: "refined", queryCount: queries.length },
    config,
  );

  return { queries, phase: "research:refine" };
}
