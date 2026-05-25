/**
 * Wiki Compose P4 — `ingestPlannerGraph` (issue #952).
 *
 * 記事クリップ ingest フロー。`prepare_ingest` の後に P1 調査ループ
 * （`researchLoopSubgraph` と同じノード / tools / `shouldRefine`）を組み込み、
 * `human_review_research` のあと `plan_ingest` で merge / create / skip を決定する。
 *
 * Ingest planner graph: seeds clip context, runs the shared research loop
 * (same nodes/tools as Compose), then emits an ingest plan via ZediChatModel.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { registerGraph, type GraphFactory } from "../../registry/graphRegistry.js";
import { shouldRefine } from "../../subgraphs/research/researchGraph.js";
import {
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
  humanReviewResearch,
} from "../../subgraphs/research/nodes/index.js";
import { IngestPlannerState } from "./state.js";
import { prepareIngest, planIngest } from "./nodes/index.js";

/** Registered graph id. / 登録グラフ ID。 */
export const INGEST_PLANNER_GRAPH_ID = "ingest-planner" as const;
/** Registered graph version. / 登録グラフのバージョン。 */
export const INGEST_PLANNER_GRAPH_VERSION = "1.0.0";

const factory: GraphFactory = ({ checkpointer }) => {
  const builder = new StateGraph(IngestPlannerState)
    .addNode("prepare_ingest", prepareIngest)
    .addNode("plan_ingest", planIngest)
    .addEdge(START, "prepare_ingest")
    // Research loop (same wiring as `researchLoopSubgraph` / `wireResearchLoopSubgraph`).
    .addNode("plan_queries", planQueries)
    .addNode("web_search", webSearch)
    .addNode("wiki_search", wikiSearch)
    .addNode("fetch_articles", fetchArticles)
    .addNode("evaluate_sufficiency", evaluateSufficiency)
    .addNode("refine_queries", refineQueries)
    .addNode("compile_batch", compileBatch)
    .addNode("human_review_research", humanReviewResearch)
    .addEdge("prepare_ingest", "plan_queries")
    .addEdge("plan_queries", "web_search")
    .addEdge("plan_queries", "wiki_search")
    .addEdge("web_search", "fetch_articles")
    .addEdge("wiki_search", "fetch_articles")
    .addEdge("fetch_articles", "evaluate_sufficiency")
    .addConditionalEdges("evaluate_sufficiency", shouldRefine, {
      refine: "refine_queries",
      compile: "compile_batch",
    })
    .addEdge("refine_queries", "web_search")
    .addEdge("refine_queries", "wiki_search")
    .addEdge("compile_batch", "human_review_research")
    .addEdge("human_review_research", "plan_ingest")
    .addEdge("plan_ingest", END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
};

/**
 * Register the ingest planner graph. Idempotent; call from `app.ts` bootstrap.
 * ingest プランナーグラフを登録する。`app.ts` 起動時に呼ぶ（冪等）。
 */
export function registerIngestPlannerGraph(): void {
  registerGraph({
    id: INGEST_PLANNER_GRAPH_ID,
    version: INGEST_PLANNER_GRAPH_VERSION,
    phase: "ingest",
    description:
      "Wiki Compose P4: ingest clip planner. Runs the P1 research loop (shared nodes/tools) " +
      "then plans merge/create/skip via ZediChatModel. Interrupt at human_review_research; " +
      "resume payload matches wiki-compose-research. Coexists with POST /api/ingest/plan (#595).",
    factory,
  });
}
