/**
 * Wiki Compose research-loop subgraph (#949) — public barrel.
 *
 * 調査ループ subgraph の外向け window。`app.ts` / `agents/index.ts` から
 * このファイル経由で `RESEARCH_GRAPH_ID` と `registerResearchLoopGraph` を
 * 引く。直接ノードを import したいテストは `./nodes/index.js` を見る。
 */
export {
  RESEARCH_GRAPH_ID,
  RESEARCH_GRAPH_VERSION,
  registerResearchLoopGraph,
  shouldRefine,
} from "./researchGraph.js";
export {
  ResearchLoopState,
  type ResearchLoopStateType,
  type ResearchLoopStateUpdate,
} from "./state.js";
export type {
  Source,
  PlannedQuery,
  Evaluation,
  ResearchBatch,
  ExitReason,
  ResearchResumeInput,
} from "./types.js";
export { researchResumeSchema, type ResearchResumeParsed } from "./resumeSchema.js";
export type { HumanReviewInterruptPayload } from "./nodes/humanReviewResearch.js";
