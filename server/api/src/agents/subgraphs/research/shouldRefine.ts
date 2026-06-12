/**
 * Research loop exit predicate (`evaluate_sufficiency` → refine | compile).
 */
import type { ResearchLoopStateType } from "./state.js";

/** Score at or above which the evaluator considers research sufficient. */
export const RESEARCH_SUFFICIENCY_SCORE_THRESHOLD = 0.75;

/**
 * 終了条件判定。`evaluate_sufficiency` の直後に呼ばれる。
 *
 * - `score >= 0.75` → `"compile"` (agent decided sources are sufficient)
 * - `iteration >= maxIterations` → `"compile"` (explicit ingest cap or safety cap)
 * - otherwise → `"refine"`
 */
export function shouldRefine(state: ResearchLoopStateType): "refine" | "compile" {
  const score = state.lastEvaluation?.score;
  if (typeof score === "number" && score >= RESEARCH_SUFFICIENCY_SCORE_THRESHOLD) return "compile";
  if (state.iteration >= state.maxIterations) return "compile";
  return "refine";
}
