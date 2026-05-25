/**
 * Wiki Compose P5 — `wikiMaintenanceGraph` (#953).
 *
 * リンク切れ検出・スタブページ検出を順に走らせ、メンテナンスプランを返す。
 * Compose orchestrator とは独立した graphId で `GraphRegistry` に登録する。
 *
 * Linear graph: `scan_broken_links` → `scan_stub_pages` → `plan_maintenance` → END.
 * No HITL interrupts in P5 — future versions may add repair subgraphs per finding.
 *
 * ## Non-goals
 * - Automatic link repair or page creation (human or a future repair graph).
 * - Full Y.Doc body analysis (uses `content_preview` heuristic only).
 *
 * ## Extension points
 * - Additional scan nodes (orphan, ghost_many, stale) via parallel fan-out.
 * - Conditional routing when `brokenLinkCount === 0` to skip LLM planning steps.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { registerGraph, type GraphFactory } from "../../registry/graphRegistry.js";
import { WikiMaintenanceState } from "./state.js";
import { scanBrokenLinks, scanStubPages, planMaintenance } from "./nodes/index.js";

/** Registered graph id. */
export const WIKI_MAINTENANCE_GRAPH_ID = "wiki-maintenance" as const;
export const WIKI_MAINTENANCE_GRAPH_VERSION = "1.0.0";

const factory: GraphFactory = ({ checkpointer }) => {
  const builder = new StateGraph(WikiMaintenanceState)
    .addNode("scan_broken_links", scanBrokenLinks)
    .addNode("scan_stub_pages", scanStubPages)
    .addNode("plan_maintenance", planMaintenance)
    .addEdge(START, "scan_broken_links")
    .addEdge("scan_broken_links", "scan_stub_pages")
    .addEdge("scan_stub_pages", "plan_maintenance")
    .addEdge("plan_maintenance", END);

  return checkpointer ? builder.compile({ checkpointer }) : builder.compile();
};

/** Register the wiki maintenance graph. Idempotent; call from `app.ts` bootstrap. */
export function registerWikiMaintenanceGraph(): void {
  registerGraph({
    id: WIKI_MAINTENANCE_GRAPH_ID,
    version: WIKI_MAINTENANCE_GRAPH_VERSION,
    phase: "maintenance",
    description:
      "Wiki maintenance P5: scan broken links (lint rule) and stub pages (short content_preview), " +
      "then emit a MaintenancePlan. No interrupts; suitable for background / admin runs.",
    factory,
  });
}
