/**
 * Wiki Compose P5 — conditional routing predicates (#953).
 *
 * `wikiComposeGraph` の conditional edge が呼ぶ純関数群。LLM や DB に触れず、
 * state のみから次ノードを決めるため Vitest で単体テストしやすい。
 *
 * Pure routing functions for orchestrator conditional edges. No I/O — only
 * state inspection — so each branch is covered by focused unit tests.
 *
 * ## Non-goals (本 Issue では実装しない)
 * - `media_curator` subgraph（画像スロット分岐）は outline 側のメタデータ設計後に追加。
 * - Draft 3 回失敗時の `escalate_to_orchestrator` は retry カウンタ設計が必要なため保留。
 * - pgvector による Wiki Linker 強化は別 Epic。
 *
 * ## Extension points
 * - `routeAfterBrief`: `chatSeed` / Brief 0 件以外のシグナル（例: 明示 `skipResearch`）を足せる。
 * - `routeAfterResearch`: `researchResumeSchema.flagConflicts` 等の明示フラグと併用可能。
 * - `routeAfterOutline`: 将来 `OutlineSection.mediaSlots` で `media_curator` へ分岐。
 */
import type { WikiComposeStateType } from "./state.js";

/** Edge label after `human_review_brief`. */
export type BriefRoute = "research" | "skip_research";

/** Edge label after `human_review_research`. */
export type ResearchRoute = "structure" | "conflict_resolution";

/**
 * Brief 完了後に調査ループへ進むか Structure へ直行するか。
 *
 * Skips research when the Brief intentionally emitted zero questions (title
 * already clear) or when chat seeded a pre-approved outline. When
 * `briefDegraded` is set (LLM failure fallback), always run research.
 */
export function routeAfterBrief(state: WikiComposeStateType): BriefRoute {
  if (state.chatSeed?.outline?.trim()) return "skip_research";
  if (state.briefQuestions.length === 0 && !state.briefDegraded) return "skip_research";
  return "research";
}

/**
 * 調査 HITL 後に矛盾解消ノードへ寄せるか Structure へ進むか。
 *
 * Heuristic: user approved some sources but rejected two or more — signals
 * contradictory evidence worth a dedicated resolution step before outline.
 */
export function shouldResolveResearchConflicts(state: WikiComposeStateType): boolean {
  return state.rejectedResearch.length >= 2 && state.approvedResearch.length >= 1;
}

/**
 * Research フェーズ完了後の分岐ラベル。
 */
export function routeAfterResearch(state: WikiComposeStateType): ResearchRoute {
  return shouldResolveResearchConflicts(state) ? "conflict_resolution" : "structure";
}
