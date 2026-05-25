/**
 * `scan_broken_links` — runs the broken-link lint rule for the session owner.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { runBrokenLinkRule } from "../../../../services/lintEngine/rules/brokenLink.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import type { WikiMaintenanceStateUpdate } from "../state.js";
import type { MaintenanceFinding } from "../types.js";

export async function scanBrokenLinks(
  _state: unknown,
  config: LangGraphRunnableConfig,
): Promise<WikiMaintenanceStateUpdate> {
  const ctx = getGraphContext(config);
  const result = await runBrokenLinkRule(ctx.userId, ctx.db);
  const brokenLinkFindings: MaintenanceFinding[] = result.findings.map((f) => ({
    rule: "broken_link",
    severity: f.severity,
    pageIds: f.pageIds,
    detail: f.detail as Record<string, unknown>,
  }));
  return {
    brokenLinkFindings,
    phase: "maintenance:broken_links_scanned",
  };
}
