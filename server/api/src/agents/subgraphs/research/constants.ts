/**
 * Research loop limits and shared thresholds for Wiki Compose / ingest graphs.
 * Wiki Compose / ingest グラフ共通の調査ループ定数。
 */

/**
 * Hard safety cap for autonomous Wiki Compose research loops. The evaluator
 * LLM decides when sources are sufficient; this constant prevents runaway loops.
 *
 * 自律調査の安全上限。充足度評価 LLM が十分と判断するまでループし、
 * 無限ループ防止のためだけにこの上限を使う。
 */
export const RESEARCH_SAFETY_MAX_ITERATIONS = 10;

/**
 * Score at or above which research is treated as sufficient when the evaluator
 * does not set {@link Evaluation.sufficient} explicitly.
 *
 * 評価 LLM が `sufficient` を返さない場合のフォールバック閾値。
 */
export const RESEARCH_SUFFICIENCY_SCORE_THRESHOLD = 0.75;

/**
 * Ingest planner graph id. Keep in sync with
 * {@link INGEST_PLANNER_GRAPH_ID} in `graphs/ingest/ingestPlannerGraph.ts`.
 *
 * ingest グラフ ID。ingest 側の定数と文字列一致を維持する。
 */
export const INGEST_RESEARCH_GRAPH_ID = "ingest-planner" as const;

/** Ingest API explicit iteration cap range (1..5). / ingest 明示 cap の範囲。 */
export const INGEST_EXPLICIT_MAX_ITERATIONS_MIN = 1;
export const INGEST_EXPLICIT_MAX_ITERATIONS_MAX = 5;

/**
 * Clamp ingest `maxIterations` input to 1..5 (default 3 when invalid).
 *
 * ingest の `maxIterations` を 1..5 にクランプする。
 *
 * @param raw Value from ingest graph state / run input.
 */
export function clampIngestMaxIterations(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  return Math.min(
    Math.max(truncated, INGEST_EXPLICIT_MAX_ITERATIONS_MIN),
    INGEST_EXPLICIT_MAX_ITERATIONS_MAX,
  );
}

/**
 * Resolve the iteration cap for the research loop from the owning graph id.
 *
 * - ingest planner → clamped caller cap (1..5)
 * - Wiki Compose / standalone research → {@link RESEARCH_SAFETY_MAX_ITERATIONS}
 *
 * Legacy checkpoints with `maxIterations: 3` on Wiki Compose graphs are ignored;
 * only ingest uses state-provided caps.
 *
 * @param graphId Owning graph id from {@link GraphContext}.
 * @param stateMaxIterations Current `state.maxIterations` (ingest only).
 */
export function resolveResearchMaxIterations(graphId: string, stateMaxIterations: unknown): number {
  if (graphId === INGEST_RESEARCH_GRAPH_ID) {
    return clampIngestMaxIterations(stateMaxIterations);
  }
  return RESEARCH_SAFETY_MAX_ITERATIONS;
}
