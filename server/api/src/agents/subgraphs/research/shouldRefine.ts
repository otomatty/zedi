/**
 * Research loop exit predicate (`evaluate_sufficiency` → refine | compile).
 */
import { RESEARCH_SUFFICIENCY_SCORE_THRESHOLD } from "./constants.js";
import type { ResearchLoopStateType } from "./state.js";
import type { Evaluation } from "./types.js";

export { RESEARCH_SUFFICIENCY_SCORE_THRESHOLD };

/**
 * Whether the latest evaluation considers research sufficient to compile.
 *
 * Prefers the evaluator's explicit `sufficient` flag; falls back to score threshold.
 *
 * @param evaluation Latest evaluation from `evaluate_sufficiency`, if any.
 */
export function isResearchSufficient(evaluation: Evaluation | null | undefined): boolean {
  if (!evaluation) return false;
  if (evaluation.sufficient) return true;
  return evaluation.score >= RESEARCH_SUFFICIENCY_SCORE_THRESHOLD;
}

/**
 * 終了条件判定。`evaluate_sufficiency` の直後に呼ばれる。
 *
 * - evaluator marks sufficient → `"compile"`
 * - `iteration >= maxIterations` → `"compile"` (ingest cap or safety cap)
 * - otherwise → `"refine"`
 */
export function shouldRefine(state: ResearchLoopStateType): "refine" | "compile" {
  if (isResearchSufficient(state.lastEvaluation)) return "compile";
  if (state.iteration >= state.maxIterations) return "compile";
  return "refine";
}
