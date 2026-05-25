/**
 * `scan_stub_pages` — detects pages with very little stored preview text.
 *
 * Full Y.Doc bodies live in Hocuspocus; `pages.content_preview` is the best
 * server-side heuristic for "stub" pages without pulling every document.
 */
import { and, asc, eq, or, isNull, sql } from "drizzle-orm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { pages } from "../../../../schema/pages.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import type { WikiMaintenanceStateUpdate } from "../state.js";
import type { MaintenanceFinding } from "../types.js";

/** Minimum trimmed preview length to treat a page as non-stub. */
const STUB_PREVIEW_MAX_LEN = 40;

export async function scanStubPages(
  _state: unknown,
  config: LangGraphRunnableConfig,
): Promise<WikiMaintenanceStateUpdate> {
  const ctx = getGraphContext(config);
  const rows = await ctx.db
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(
      and(
        eq(pages.ownerId, ctx.userId),
        eq(pages.isDeleted, false),
        or(
          isNull(pages.contentPreview),
          sql`length(trim(${pages.contentPreview})) < ${STUB_PREVIEW_MAX_LEN}`,
        ),
      ),
    )
    .orderBy(asc(pages.id))
    .limit(200);

  const stubPageFindings: MaintenanceFinding[] = rows.map((p) => ({
    rule: "stub_page",
    severity: "info",
    pageIds: [p.id],
    detail: {
      title: p.title ?? "(無題 / untitled)",
      suggestion:
        "プレビューが空または極端に短いです。本文の拡充やスタブへのリンクを検討してください / " +
        "Page preview is empty or very short. Consider expanding or linking this stub.",
    },
  }));

  return {
    stubPageFindings,
    phase: "maintenance:stub_pages_scanned",
  };
}
