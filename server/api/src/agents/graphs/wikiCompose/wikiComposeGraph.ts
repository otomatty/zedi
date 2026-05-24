/**
 * Wiki Compose P2 — `wikiComposeGraph` orchestrator (issue #950).
 *
 * Brief → Research → Structure → Draft → Completed の全体フローを担う
 * LangGraph オーケストレータ。`researchLoopSubgraph` (#949 / P1) を **subgraph
 * as node** として組み込み、ループ内 interrupt
 * (`human_review_research`) は親グラフから見ても通常の interrupt として伝播する
 * （状態は `WikiComposeState` の superset 設計により自動共有）。
 *
 * Top-level orchestrator. The research subgraph composes as a node so a
 * single PostgresSaver thread services Brief → Research → Outline → Draft.
 * Each interrupt halts the same `thread_id` and resumes through the same
 * `PATCH /resume` route.
 *
 * Pipeline:
 *
 * ```
 * START
 *   → brief_dialogue
 *   → human_review_brief                       [interrupt #1]
 *   → research_subgraph (= researchLoopSubgraph)
 *       └── plan → search → fetch → eval → … → human_review_research  [interrupt #2]
 *   → structure_dialogue
 *   → human_review_outline                     [interrupt #3]
 *   → draft_sections
 *   → completed
 *   → END
 * ```
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { WikiComposeState } from "./state.js";
import {
  registerGraph,
  type GraphFactory,
  type GraphFactoryInput,
  type CompiledGraphLike,
} from "../../registry/graphRegistry.js";
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
import {
  briefDialogue,
  humanReviewBrief,
  structureDialogue,
  humanReviewOutline,
  draftSections,
  completed,
} from "./nodes/index.js";
import { shouldRefine } from "../../subgraphs/research/researchGraph.js";

/** Registered graph id. */
export const WIKI_COMPOSE_GRAPH_ID = "wiki-compose" as const;
/** Registered graph version. Bump when behaviour changes meaningfully. */
export const WIKI_COMPOSE_GRAPH_VERSION = "1.0.0";

/**
 * Inlined research nodes vs separate subgraph: we inline the research nodes
 * at the orchestrator level so the parent state's `iteration` / `queries` /
 * `pendingSources` channels are written directly and the interrupt at
 * `human_review_research` halts the parent thread_id without a translation
 * layer. This is equivalent to subgraph-as-node composition since the
 * orchestrator state is a strict superset of `ResearchLoopState` (see
 * `state.ts`).
 *
 * 研究ノードは orchestrator state 上に直接配置する。state を superset 設計に
 * したので state は自動共有され、interrupt は親 thread_id で halt する。
 */
const factory: GraphFactory = ({ checkpointer }: GraphFactoryInput): CompiledGraphLike => {
  const builder = new StateGraph(WikiComposeState)
    // Brief phase
    .addNode("brief_dialogue", briefDialogue)
    .addNode("human_review_brief", humanReviewBrief)
    // Research phase (inlined research subgraph nodes, sharing state)
    .addNode("plan_queries", planQueries)
    .addNode("web_search", webSearch)
    .addNode("wiki_search", wikiSearch)
    .addNode("fetch_articles", fetchArticles)
    .addNode("evaluate_sufficiency", evaluateSufficiency)
    .addNode("refine_queries", refineQueries)
    .addNode("compile_batch", compileBatch)
    .addNode("human_review_research", humanReviewResearch)
    // Structure phase
    .addNode("structure_dialogue", structureDialogue)
    .addNode("human_review_outline", humanReviewOutline)
    // Draft + completion
    .addNode("draft_sections", draftSections)
    .addNode("completed", completed)
    // Edges
    .addEdge(START, "brief_dialogue")
    .addEdge("brief_dialogue", "human_review_brief")
    .addEdge("human_review_brief", "plan_queries")
    // Research loop (mirrors researchLoopSubgraph wiring).
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
    .addEdge("human_review_research", "structure_dialogue")
    // Structure phase.
    .addEdge("structure_dialogue", "human_review_outline")
    .addEdge("human_review_outline", "draft_sections")
    // Draft + completion.
    .addEdge("draft_sections", "completed")
    .addEdge("completed", END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
};

/**
 * Register the Wiki Compose orchestrator graph. Idempotent.
 *
 * `app.ts` から `registerResearchLoopGraph()` と並べて呼ぶ。再登録は registry が
 * 上書きで吸収する。
 */
export function registerWikiComposeGraph(): void {
  registerGraph({
    id: WIKI_COMPOSE_GRAPH_ID,
    version: WIKI_COMPOSE_GRAPH_VERSION,
    phase: "orchestrator",
    description:
      "Wiki Compose P2: full orchestrator. Brief → research → structure → draft → completed. " +
      "Embeds the P1 research loop in-place via shared state (orchestrator state is a strict " +
      "superset of ResearchLoopState). Three interrupt points: human_review_brief, " +
      "human_review_research, human_review_outline.",
    factory,
  });
}
