/**
 * Wiki Compose agent infrastructure — public barrel.
 *
 * `server/api` の他レイヤから agent モジュールを参照する際の唯一の入口。サブ
 * パス (`agents/runner/...` 等) を直接 import するより、本ファイル経由で抽象を
 * 維持することで、内部リファクタの影響範囲を限定する。
 *
 * Single entry barrel for the agent subsystem. External callers (routes,
 * services, scripts) import from here so internal directory shuffles do not
 * cascade across the codebase.
 *
 * Issue: otomatty/zedi#948
 */
export {
  ZediChatModel,
  type ZediChatModelParams,
  type CallProviderFn,
  type StreamProviderFn,
} from "./core/llm/zediChatModel.js";
export {
  createZediChatModel,
  assertSupportedBackendP0,
  UnsupportedBackendError,
  type CreateZediChatModelInput,
} from "./core/llm/modelFactory.js";
export {
  recordZediUsage,
  toZediMessages,
  type RecordZediUsageInput,
  type RecordZediUsageResult,
} from "./core/llm/usageCallback.js";
export {
  getPostgresCheckpointer,
  ensurePostgresCheckpointerSetup,
  resolveCheckpointerForRun,
} from "./core/checkpoint/index.js";
export { BaseState, type BaseStateType, type BaseStateUpdate } from "./core/state/baseState.js";
export {
  SHARED_TOOLS,
  webSearchTool,
  wikiSearchTool,
  fetchArticleTool,
  imageSearchTool,
} from "./core/tools/index.js";
export * from "./core/types/index.js";
export {
  registerGraph,
  getRegisteredGraph,
  listRegisteredGraphs,
  GraphNotRegisteredError,
  type GraphFactory,
  type GraphFactoryInput,
  type RegisteredGraph,
} from "./registry/graphRegistry.js";
export { STUB_GRAPH_ID, registerStubGraph } from "./registry/stubGraph.js";
export {
  GraphRunner,
  type RunInput,
  type RunPayload,
  type RunResult,
} from "./runner/graphRunner.js";
export {
  mapLangGraphEvent,
  startedEvent,
  statusEvent,
  usageEvent,
  doneEvent,
  errorEvent,
  type LangGraphRuntimeEvent,
} from "./runner/sseMapper.js";
export {
  RESEARCH_GRAPH_ID,
  RESEARCH_GRAPH_VERSION,
  registerResearchLoopGraph,
  shouldRefine,
  ResearchLoopState,
  type ResearchLoopStateType,
  type ResearchLoopStateUpdate,
  type Source as ResearchSource,
  type PlannedQuery,
  type Evaluation,
  type ResearchBatch,
  type ExitReason,
  type ResearchResumeInput,
  researchResumeSchema,
  type ResearchResumeParsed,
  type HumanReviewInterruptPayload,
} from "./subgraphs/research/index.js";
