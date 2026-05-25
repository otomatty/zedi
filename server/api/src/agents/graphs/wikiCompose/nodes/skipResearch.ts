/**
 * `skip_research` — bypasses the P1 research loop when Brief routing decides
 * research adds little value (#953).
 *
 * Brief ルーティングで調査をスキップするときのノード。`approvedResearch` を
 * 空にし、exitReason を `brief_skip` にして Structure フェーズへ進む。
 */
import type { WikiComposeStateUpdate } from "../state.js";

/**
 * Project a no-op research outcome so downstream Structure can run without
 * an extra HITL at `human_review_research`.
 */
export async function skipResearch(): Promise<WikiComposeStateUpdate> {
  return {
    approvedResearch: [],
    rejectedResearch: [],
    batches: [],
    exitReason: "brief_skip",
    phase: "research:skipped",
  };
}
