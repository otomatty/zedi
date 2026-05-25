/**
 * Resolve LLM model row ids used by Wiki Compose graphs (for BYOK validation).
 * Wiki Compose グラフが使うモデル行 ID を解決する（BYOK 検証用）。
 */
import { WIKI_COMPOSE_GRAPH_ID } from "../graphs/wikiCompose/index.js";
import { WIKI_MAINTENANCE_GRAPH_ID } from "../graphs/wikiMaintenance/index.js";
import { getOrchestratorModelId } from "../subgraphs/research/nodes/planQueries.js";
import { RESEARCH_GRAPH_ID } from "../subgraphs/research/index.js";
import { INGEST_PLANNER_GRAPH_ID } from "../graphs/ingest/index.js";

const DRAFT_MODEL_ENV = "WIKI_COMPOSE_DRAFT_MODEL_ID";
const DRAFT_MODEL_FALLBACK = "claude-3-5-sonnet";

function getDraftModelId(): string {
  return process.env[DRAFT_MODEL_ENV]?.trim() || DRAFT_MODEL_FALLBACK;
}

/**
 * Model row ids (`ai_models.id`) that a compose graph run will call via `createZediChatModel`.
 * `createZediChatModel` 経由で呼ばれるモデル行 ID 一覧。
 */
export function getComposeModelIdsForGraph(graphId: string): string[] {
  // Lint-only graph — no `createZediChatModel` calls; BYOK must not require orchestrator keys.
  if (graphId === WIKI_MAINTENANCE_GRAPH_ID) return [];
  if (graphId === WIKI_COMPOSE_GRAPH_ID) {
    const orchestrator = getOrchestratorModelId();
    const draft = getDraftModelId();
    return orchestrator === draft ? [orchestrator] : [orchestrator, draft];
  }
  if (graphId === RESEARCH_GRAPH_ID || graphId === INGEST_PLANNER_GRAPH_ID) {
    return [getOrchestratorModelId()];
  }
  return [getOrchestratorModelId()];
}
