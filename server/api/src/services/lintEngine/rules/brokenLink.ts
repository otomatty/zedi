import { eq, and, sql } from "drizzle-orm";
import { links } from "../../../schema/links.js";
import { pages } from "../../../schema/pages.js";
import type { Database } from "../../../types/index.js";
import type { LintRuleResult } from "../types.js";

/**
 * リンク切れ検出ルール。
 * 削除済みページを指すリンクを検出する。
 *
 * Broken link detection rule.
 * Detects links pointing to deleted pages.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns リンク切れの検出結果 / Broken link findings
 */
export async function runBrokenLinkRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  // source ページが存在し、target ページが削除済みのリンクを取得
  // Find links where source page is active but target page is deleted
  const sourcePage = pages;

  const broken = await db
    .select({
      sourceId: links.sourceId,
      targetId: links.targetId,
      sourceTitle: sourcePage.title,
    })
    .from(links)
    .innerJoin(sourcePage, eq(links.sourceId, sourcePage.id))
    .where(
      and(
        eq(sourcePage.ownerId, ownerId),
        eq(sourcePage.isDeleted, false),
        sql`EXISTS (
          SELECT 1 FROM pages AS target
          WHERE target.id = ${links.targetId}
          AND target.is_deleted = true
        )`,
      ),
    );

  return {
    rule: "broken_link",
    findings: broken.map((b) => ({
      rule: "broken_link" as const,
      severity: "error" as const,
      pageIds: [b.sourceId, b.targetId],
      detail: {
        sourceTitle: b.sourceTitle ?? "(無題 / untitled)",
        sourceId: b.sourceId,
        targetId: b.targetId,
        suggestion:
          "リンク先が削除されています。リンクの修正を検討してください / Link target has been deleted. Consider fixing the link.",
      },
    })),
  };
}
