/**
 * Value types for the Wiki maintenance graph (#953).
 *
 * Wiki メンテナンス graph が扱う検出結果・プランの型。LangGraph state から分離し、
 * テスト fixture が runtime を import しなくて済むようにする。
 */

/** One lint-style finding projected into graph state. */
export interface MaintenanceFinding {
  rule: "broken_link" | "stub_page";
  severity: "error" | "warn" | "info";
  pageIds: string[];
  detail: Record<string, unknown>;
}

/**
 * Aggregated maintenance plan emitted at the end of the graph.
 */
export interface MaintenancePlan {
  brokenLinkCount: number;
  stubPageCount: number;
  findings: MaintenanceFinding[];
  /** ISO timestamp when the plan was assembled. */
  plannedAt: string;
}
