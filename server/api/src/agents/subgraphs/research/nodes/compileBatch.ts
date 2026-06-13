/**
 * `compile_batch` — pure projection node that produces a {@link ResearchBatch}
 * from the current state and emits a `research_batch` SSE custom event.
 *
 * pure な projection ノード。`pendingSources` のスナップショットを 1 件の
 * {@link ResearchBatch} に固めて `batches` に append し、`exitReason` を確定する。
 * LLM 呼び出しは行わない。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { INGEST_RESEARCH_GRAPH_ID } from "../constants.js";
import { isResearchSufficient } from "../shouldRefine.js";
import { getGraphContext } from "./shared/getGraphContext.js";
import { dispatchResearchBatch } from "./shared/dispatchSseCustom.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
import type { ResearchBatch, ResearchLoopCompileExitReason } from "../types.js";

/**
 * Derive the loop exit reason from evaluation + graph ownership.
 *
 * @param state Current research-loop state after `evaluate_sufficiency`.
 * @param graphId Owning graph id from {@link GraphContext}.
 */
export function resolveResearchExitReason(
  state: ResearchLoopStateType,
  graphId: string,
): ResearchLoopCompileExitReason {
  if (isResearchSufficient(state.lastEvaluation)) return "score_threshold";
  return graphId === INGEST_RESEARCH_GRAPH_ID ? "max_iterations" : "safety_cap";
}

/**
 * `compile_batch` node — pure projection that freezes the current state into a
 * UI-facing {@link ResearchBatch}, appends it to `state.batches`, and dispatches
 * the `research_batch` SSE custom event.
 *
 * `compile_batch` ノード本体。`pendingSources` のスナップショットを 1 件の
 * {@link ResearchBatch} に固めて `batches` に append し、`exitReason` を確定する。
 *
 * @param state  Current research-loop state.
 * @param config LangGraph runnable config (carries `GraphContext` + callbacks).
 * @returns Partial state update: `{ batches: [newBatch], exitReason, phase }`.
 */
export async function compileBatch(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const ctx = getGraphContext(config);
  const score = state.lastEvaluation?.score ?? null;
  const exitReason = resolveResearchExitReason(state, ctx.graphId);
  const batch: ResearchBatch = {
    id: randomUUID(),
    iteration: state.iteration,
    queries: state.queries,
    sources: state.pendingSources,
    evaluation: state.lastEvaluation,
    createdAt: new Date().toISOString(),
  };

  await dispatchResearchBatch(
    {
      batchId: batch.id,
      iteration: batch.iteration,
      sourceCount: batch.sources.length,
      score,
      exitReason,
    },
    config,
  );

  return {
    batches: [batch],
    exitReason,
    phase: "research:compile",
  };
}
