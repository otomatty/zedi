import { eq, sql } from "drizzle-orm";
import { ghostLinks } from "../../../schema/links.js";
import { pages } from "../../../schema/pages.js";
import type { Database } from "../../../types/index.js";
import type { LintRuleResult } from "../types.js";

/**
 * 同じリンクテキストのゴーストリンクが多数あるものを検出するための閾値。
 * Threshold for detecting ghost links with the same link text appearing many times.
 */
const GHOST_LINK_THRESHOLD = 3;

/**
 * Ghost Link 過多検出ルール。
 * 同じ link_text が N 件以上のソースページから参照されている場合、新規ページ候補として提示する。
 *
 * Ghost link excess detection rule.
 * When the same link_text appears in N+ source pages, suggests creating a new page.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns Ghost Link 過多の検出結果 / Ghost link excess findings
 */
export async function runGhostManyRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  // owner_id でフィルタするため、ghost_links → pages を JOIN して owner を制限
  // Join ghost_links → pages to filter by owner_id
  const rows = await db
    .select({
      linkText: ghostLinks.linkText,
      count: sql<number>`count(*)::int`.as("cnt"),
      sourcePageIds: sql<string[]>`array_agg(${ghostLinks.sourcePageId}::text)`.as(
        "source_page_ids",
      ),
    })
    .from(ghostLinks)
    .innerJoin(pages, eq(ghostLinks.sourcePageId, pages.id))
    .where(eq(pages.ownerId, ownerId))
    .groupBy(ghostLinks.linkText)
    .having(sql`count(*) >= ${GHOST_LINK_THRESHOLD}`);

  return {
    rule: "ghost_many",
    findings: rows.map((r) => ({
      rule: "ghost_many" as const,
      severity: "warn" as const,
      pageIds: r.sourcePageIds,
      detail: {
        linkText: r.linkText,
        count: r.count,
        suggestion: `「${r.linkText}」の新規ページ作成を検討してください / Consider creating a new page for "${r.linkText}"`,
      },
    })),
  };
}
