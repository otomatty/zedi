import { eq, and, sql } from "drizzle-orm";
import { pages } from "../../../schema/pages.js";
import type { Database } from "../../../types/index.js";
import type { LintRuleResult } from "../types.js";

/**
 * 孤立ページ検出ルール。
 * 他のページからリンクされていない（backlinks = 0）ページを検出する。
 *
 * Orphan page detection rule.
 * Detects pages with no incoming links (backlinks = 0).
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns 孤立ページの検出結果 / Orphan page findings
 */
export async function runOrphanRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  // backlinks を持たない（links.target_id に出現しない）ページを取得
  // Get pages that do not appear as link targets (no backlinks)
  const orphans = await db
    .select({
      id: pages.id,
      title: pages.title,
    })
    .from(pages)
    .where(
      and(
        eq(pages.ownerId, ownerId),
        eq(pages.isDeleted, false),
        sql`NOT EXISTS (
          SELECT 1 FROM links WHERE links.target_id = ${pages.id}
        )`,
      ),
    );

  return {
    rule: "orphan",
    findings: orphans.map((p) => ({
      rule: "orphan" as const,
      severity: "info" as const,
      pageIds: [p.id],
      detail: { title: p.title ?? "(無題 / untitled)" },
    })),
  };
}
