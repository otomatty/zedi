/**
 * Research loop limits for Wiki Compose autonomous exploration.
 * Wiki Compose 自律調査ループの上限定数。
 */

/**
 * Hard safety cap for autonomous research loops. Wiki Compose no longer exposes
 * a user-facing iteration slider; the evaluator LLM decides when sources are
 * sufficient (`score >= 0.75`). This constant prevents runaway loops only.
 *
 * ユーザー向けの調査回数設定は廃止。充足度評価 LLM が十分と判断するまで
 * ループし、無限ループ防止のためだけにこの上限を使う。
 */
export const RESEARCH_SAFETY_MAX_ITERATIONS = 10;

/**
 * Explicit iteration cap range accepted from ingest / legacy API callers (1..5).
 * Values outside this range fall back to {@link RESEARCH_SAFETY_MAX_ITERATIONS}.
 *
 * ingest 等が明示的に渡す回数上限（1..5）。範囲外は自律モードの安全上限へ。
 */
export const INGEST_EXPLICIT_MAX_ITERATIONS_MIN = 1;
export const INGEST_EXPLICIT_MAX_ITERATIONS_MAX = 5;

/**
 * Resolve the iteration cap for the research loop.
 *
 * - `1..5` → honour explicit caller cap (ingest planner).
 * - otherwise → {@link RESEARCH_SAFETY_MAX_ITERATIONS} (autonomous Wiki Compose).
 *
 * @param raw Value from graph state before `plan_queries` runs.
 */
export function resolveResearchMaxIterations(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const truncated = Math.trunc(raw);
    if (
      truncated >= INGEST_EXPLICIT_MAX_ITERATIONS_MIN &&
      truncated <= INGEST_EXPLICIT_MAX_ITERATIONS_MAX
    ) {
      return truncated;
    }
  }
  return RESEARCH_SAFETY_MAX_ITERATIONS;
}
