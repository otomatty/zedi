/**
 * Research loop exit predicate (`evaluate_sufficiency` → refine | compile).
 */
import type { ResearchLoopStateType } from "./state.js";

/**
 * 終了条件判定。`evaluate_sufficiency` の直後に呼ばれる。
 *
 * - `score >= 0.75` → `"compile"`
 * - `iteration >= maxIterations` → `"compile"`
 * - otherwise → `"refine"`
 */
export function shouldRefine(state: ResearchLoopStateType): "refine" | "compile" {
  const score = state.lastEvaluation?.score;
  if (typeof score === "number" && score >= 0.75) return "compile";
  if (state.iteration >= state.maxIterations) return "compile";
  return "refine";
}
