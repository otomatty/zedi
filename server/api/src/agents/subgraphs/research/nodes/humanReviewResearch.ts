/**
 * `human_review_research` — HITL stop point. Calls `interrupt(...)` to halt
 * the graph and surfaces the latest batch + pending sources to the client.
 * On resume, validates the `{ approvedSourceIds, rejectedSourceIds, note }`
 * payload and projects `approvedResearch` / `rejectedResearch` into state.
 *
 * HITL 中断ノード。`interrupt()` でグラフを停止し、UI には最新バッチと
 * pendingSources を渡す。resume 時、`PATCH .../resume` 経由で送られてくる
 * `{ approvedSourceIds, rejectedSourceIds?, note? }` を `researchResumeSchema`
 * で検証し、`approvedResearch` / `rejectedResearch` を state に確定する。
 * バリデーション失敗は throw され、`graphRunner` が `{ status:"failed" }` を
 * 返して route 層が 4xx を返す。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { interrupt } from "@langchain/langgraph";
import { researchResumeSchema } from "../resumeSchema.js";
import type {
  ResearchLoopStateType,
  ResearchLoopStateUpdate,
} from "../state.js";
import type { ResearchBatch, Source } from "../types.js";

/**
 * Payload value passed to `interrupt()`. Surfaces as `SseInterruptEvent.payload`
 * on the wire so the frontend can render the approval UI without an extra fetch.
 *
 * Frontend renders this directly; do not include fields that would be unsafe
 * to expose (e.g. raw DB ids without an authorisation re-check).
 */
export interface HumanReviewInterruptPayload {
  kind: "human_review_research";
  batch: ResearchBatch | null;
  pendingSources: Source[];
}

export async function humanReviewResearch(
  state: ResearchLoopStateType,
  _config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const latestBatch = state.batches[state.batches.length - 1] ?? null;
  const payload: HumanReviewInterruptPayload = {
    kind: "human_review_research",
    batch: latestBatch,
    pendingSources: state.pendingSources,
  };

  // `interrupt(value)` halts execution; the return value is whatever the
  // resume command (`Command({ resume })`) supplies, which the route layer
  // builds from `PATCH /resume`'s body.resume field.
  // interrupt はグラフを停止し、resume 時に再開して値を返す。
  const resumeValue: unknown = interrupt(payload);
  const parsed = researchResumeSchema.parse(resumeValue);

  const approvedIds = new Set(parsed.approvedSourceIds);
  const rejectedIds = new Set(parsed.rejectedSourceIds ?? []);
  const approvedResearch = state.pendingSources.filter((s) => approvedIds.has(s.id));
  const rejectedResearch = state.pendingSources.filter((s) => rejectedIds.has(s.id));

  return {
    approvedResearch,
    rejectedResearch,
    phase: "completed",
  };
}
