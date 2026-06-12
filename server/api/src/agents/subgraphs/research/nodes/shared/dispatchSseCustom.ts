/**
 * Typed wrapper over `dispatchCustomEvent` for the research loop subgraph.
 *
 * `dispatchCustomEvent(name, data, config)` を typesafe に呼ぶための薄いラッパ。
 * `sseMapper` の `mapCustomEvent` がペイロード shape を検証するので、ノード
 * 側は本ヘルパ経由で型付きで dispatch するだけで良い。
 */
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

/** Payload shape for `research_iteration` custom events. */
export interface ResearchIterationPayload {
  iteration: number;
  status: "planned" | "refined";
  queryCount: number;
}

/** Payload shape for `research_evaluation` custom events. */
export interface ResearchEvaluationPayload {
  iteration: number;
  score: number;
  rationale: string;
  missingAspectsCount: number;
}

/** Payload shape for `research_batch` custom events. */
export interface ResearchBatchPayload {
  batchId: string;
  iteration: number;
  sourceCount: number;
  score: number | null;
  exitReason: "score_threshold" | "max_iterations" | "safety_cap";
}

/**
 * Per-event helpers. We use 3 narrow functions instead of a generic union so
 * accidentally swapping payload shapes raises a TS error at the call site.
 */
export async function dispatchResearchIteration(
  payload: ResearchIterationPayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("research_iteration", payload, config);
}

export async function dispatchResearchEvaluation(
  payload: ResearchEvaluationPayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("research_evaluation", payload, config);
}

export async function dispatchResearchBatch(
  payload: ResearchBatchPayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("research_batch", payload, config);
}
