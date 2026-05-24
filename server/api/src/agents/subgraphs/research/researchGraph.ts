/**
 * Wiki Compose P1 — `researchLoopSubgraph` (issue #949).
 *
 * 自律調査ループ subgraph。`plan_queries` → `(web_search ∥ wiki_search)` →
 * `fetch_articles` → `evaluate_sufficiency` を 1 イテレーションとし、
 * `shouldRefine` の判定で `refine_queries` (= 次ループ) か `compile_batch` →
 * `human_review_research` (= HITL 中断) のいずれかに分岐する。終了条件:
 * `score >= 0.75` OR `iteration >= maxIterations` (default 3, clamp 1..5)。
 *
 * Cyclic LangGraph with a parallel fan-out (`web_search ∥ wiki_search`) and a
 * conditional edge after `evaluate_sufficiency`. The HITL stop is implemented
 * via `interrupt(value)` inside `human_review_research` so the resume payload
 * (`{ approvedSourceIds, rejectedSourceIds, note }`) flows back into the same
 * node which projects it into `approvedResearch` / `rejectedResearch`.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { ResearchLoopState, type ResearchLoopStateType } from "./state.js";
import { registerGraph, type GraphFactory } from "../../registry/graphRegistry.js";
import {
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
  humanReviewResearch,
} from "./nodes/index.js";

/** Registered graph id. */
export const RESEARCH_GRAPH_ID = "wiki-compose-research" as const;
/** Registered graph version. Bump when behaviour changes meaningfully. */
export const RESEARCH_GRAPH_VERSION = "1.0.0";

/**
 * 終了条件判定。`evaluate_sufficiency` の直後に呼ばれる。
 *
 * Conditional edge predicate:
 * - `score >= 0.75` → `"compile"` (exit loop)
 * - `iteration >= maxIterations` → `"compile"` (hard cap)
 * - otherwise → `"refine"` (loop back)
 *
 * Pure function; unit-tested directly in `researchGraph.conditional.test.ts`.
 */
export function shouldRefine(state: ResearchLoopStateType): "refine" | "compile" {
  const score = state.lastEvaluation?.score;
  if (typeof score === "number" && score >= 0.75) return "compile";
  if (state.iteration >= state.maxIterations) return "compile";
  return "refine";
}

const factory: GraphFactory = ({ checkpointer }) => {
  // LangGraph's `StateGraph` chaining is heavily typed; we let the inference
  // flow naturally instead of pinning intermediate types, mirroring the stub
  // graph (`registry/stubGraph.ts`).
  const builder = new StateGraph(ResearchLoopState)
    .addNode("plan_queries", planQueries)
    .addNode("web_search", webSearch)
    .addNode("wiki_search", wikiSearch)
    .addNode("fetch_articles", fetchArticles)
    .addNode("evaluate_sufficiency", evaluateSufficiency)
    .addNode("refine_queries", refineQueries)
    .addNode("compile_batch", compileBatch)
    .addNode("human_review_research", humanReviewResearch)
    .addEdge(START, "plan_queries")
    // Parallel fan-out from plan_queries.
    .addEdge("plan_queries", "web_search")
    .addEdge("plan_queries", "wiki_search")
    // Implicit join on fetch_articles (both fan-out branches feed into it).
    .addEdge("web_search", "fetch_articles")
    .addEdge("wiki_search", "fetch_articles")
    .addEdge("fetch_articles", "evaluate_sufficiency")
    .addConditionalEdges("evaluate_sufficiency", shouldRefine, {
      refine: "refine_queries",
      compile: "compile_batch",
    })
    // refine_queries kicks the next iteration (loop back via web_search).
    .addEdge("refine_queries", "web_search")
    .addEdge("refine_queries", "wiki_search")
    .addEdge("compile_batch", "human_review_research")
    .addEdge("human_review_research", END);

  // `checkpointer === false` is honoured by LangGraph as "no persistence" (the
  // test path), `BaseCheckpointSaver` enables resume in production.
  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
};

/**
 * Register the research loop graph. Called once at app bootstrap alongside
 * other graph factories. Idempotent across calls.
 *
 * `app.ts` から `registerStubGraph()` と並べて呼ぶ。再登録は registry が
 * 上書きで吸収する。
 */
export function registerResearchLoopGraph(): void {
  registerGraph({
    id: RESEARCH_GRAPH_ID,
    version: RESEARCH_GRAPH_VERSION,
    phase: "research",
    description:
      "Wiki Compose P1: autonomous research loop. Plans queries, runs web + wiki search, " +
      "fetches articles, evaluates sufficiency, optionally refines and re-loops up to " +
      "maxIterations (1..5, default 3), then interrupts at human_review_research for " +
      "HITL source approval. Resume payload: { approvedSourceIds, rejectedSourceIds?, note? }.",
    factory,
  });
}
