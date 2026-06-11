/**
 * Wiki Compose P2/P5 — `wikiComposeGraph` orchestrator (#950, #953).
 *
 * Brief → (optional Research) → (optional Conflict resolution) → Structure →
 * Draft → Completed の全体フローを担う LangGraph オーケストレータ。
 *
 * P5 adds conditional edges:
 * - After Brief: skip research when questions are empty or chat seeded an outline.
 * - After Research HITL: conflict resolution when many sources were rejected.
 *
 * Top-level orchestrator. Research nodes are inlined so state channels are shared
 * and interrupts halt the same `thread_id`. See `routing.ts` for branch predicates.
 *
 * Pipeline:
 *
 * ```
 * START → brief_dialogue → human_review_brief
 *   ├─[research]→ plan_queries → … → human_review_research
 *   └─[skip_research]→ skip_research ────────────────┐
 *                                                    ↓
 * human_review_research ─┬─[structure]──────────────┤
 *                        └─[conflict_resolution]→ conflict_resolution
 *                                                    ↓
 *                              structure_dialogue → human_review_outline
 *                              → draft_sections → completed → END
 * ```
 *
 * ## Non-goals (P5 / #953)
 * - `media_curator` subgraph, draft failure escalation, session TTL GC — tracked separately.
 *
 * ## Extension points
 * - Add `routeAfterOutline` for image-slot sections.
 * - Register sibling graphs via `GraphRegistry` (`wiki-maintenance`, template compose, …).
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
  comprehensionAids,
  completed,
  skipResearch,
  conflictResolution,
} from "./nodes/index.js";
import { shouldRefine } from "../../subgraphs/research/researchGraph.js";
import { routeAfterBrief, routeAfterResearch } from "./routing.js";

/** Registered graph id. */
export const WIKI_COMPOSE_GRAPH_ID = "wiki-compose" as const;
/** Registered graph version. Bump when behaviour changes meaningfully. */
export const WIKI_COMPOSE_GRAPH_VERSION = "1.2.0";

const factory: GraphFactory = ({ checkpointer }: GraphFactoryInput): CompiledGraphLike => {
  const builder = new StateGraph(WikiComposeState)
    // Brief phase
    .addNode("brief_dialogue", briefDialogue)
    .addNode("human_review_brief", humanReviewBrief)
    .addNode("skip_research", skipResearch)
    // Research phase (inlined research subgraph nodes, sharing state)
    .addNode("plan_queries", planQueries)
    .addNode("web_search", webSearch)
    .addNode("wiki_search", wikiSearch)
    .addNode("fetch_articles", fetchArticles)
    .addNode("evaluate_sufficiency", evaluateSufficiency)
    .addNode("refine_queries", refineQueries)
    .addNode("compile_batch", compileBatch)
    .addNode("human_review_research", humanReviewResearch)
    .addNode("conflict_resolution", conflictResolution)
    // Structure phase
    .addNode("structure_dialogue", structureDialogue)
    .addNode("human_review_outline", humanReviewOutline)
    // Draft + completion
    .addNode("draft_sections", draftSections)
    .addNode("comprehension_aids", comprehensionAids)
    .addNode("completed", completed)
    // Edges
    .addEdge(START, "brief_dialogue")
    .addEdge("brief_dialogue", "human_review_brief")
    .addConditionalEdges("human_review_brief", routeAfterBrief, {
      research: "plan_queries",
      skip_research: "skip_research",
    })
    .addEdge("skip_research", "structure_dialogue")
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
    .addConditionalEdges("human_review_research", routeAfterResearch, {
      structure: "structure_dialogue",
      conflict_resolution: "conflict_resolution",
    })
    .addEdge("conflict_resolution", "structure_dialogue")
    // Structure phase.
    .addEdge("structure_dialogue", "human_review_outline")
    .addEdge("human_review_outline", "draft_sections")
    // Draft → Understanding Layer → completion.
    .addEdge("draft_sections", "comprehension_aids")
    .addEdge("comprehension_aids", "completed")
    .addEdge("completed", END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
};

/**
 * Register the Wiki Compose orchestrator graph. Idempotent.
 */
export function registerWikiComposeGraph(): void {
  registerGraph({
    id: WIKI_COMPOSE_GRAPH_ID,
    version: WIKI_COMPOSE_GRAPH_VERSION,
    phase: "orchestrator",
    description:
      "Wiki Compose orchestrator. Brief → optional research → optional conflict resolution → " +
      "structure → draft → comprehension aids → completed. Conditional: skip research (empty Brief / " +
      "chat outline seed), conflict resolution (≥2 rejected sources with ≥1 approved). Interrupts: " +
      "brief, research, conflict (conditional), outline. `mode: instant` skips the brief/outline " +
      "interrupts so the article streams immediately; the comprehension_aids node always adds an " +
      "Understanding Layer (TL;DR / key terms / self-check questions) to the completion.",
    factory,
  });
}
