import { eq, and, isNull } from "drizzle-orm";
import { lintFindings } from "../../schema/lintFindings.js";
import type { Database } from "../../types/index.js";
import type { LintFindingCandidate, LintRuleResult } from "./types.js";
import { runOrphanRule } from "./rules/orphan.js";
import { runGhostManyRule } from "./rules/ghostMany.js";
import { runTitleSimilarRule } from "./rules/titleSimilar.js";
import { runBrokenLinkRule } from "./rules/brokenLink.js";
import { runConflictRule } from "./rules/conflict.js";

export type { LintFindingCandidate, LintRuleResult } from "./types.js";

/**
 * 全 Lint ルールを実行し、結果を lint_findings テーブルに保存する。
 * 実行前に未解決の findings をクリアし、最新の結果のみを保持する。
 *
 * Runs all lint rules and persists results to the lint_findings table.
 * Clears unresolved findings before inserting new ones to keep only latest results.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns 検出された全 findings / All detected findings
 */
export async function runAllLintRules(ownerId: string, db: Database): Promise<LintRuleResult[]> {
  // 全ルールを並列実行 / Run all rules in parallel
  const results = await Promise.all([
    runOrphanRule(ownerId, db),
    runGhostManyRule(ownerId, db),
    runTitleSimilarRule(ownerId, db),
    runBrokenLinkRule(ownerId, db),
    runConflictRule(ownerId, db),
  ]);

  // 既存の未解決 findings を削除して最新結果のみ保持
  // Delete existing unresolved findings and keep only latest results
  await db
    .delete(lintFindings)
    .where(and(eq(lintFindings.ownerId, ownerId), isNull(lintFindings.resolvedAt)));

  // 全 findings を集約してバルクインサート
  // Aggregate all findings and bulk insert
  const allFindings: LintFindingCandidate[] = results.flatMap((r) => r.findings);

  if (allFindings.length > 0) {
    await db.insert(lintFindings).values(
      allFindings.map((f) => ({
        ownerId,
        rule: f.rule,
        severity: f.severity,
        pageIds: f.pageIds,
        detail: f.detail,
      })),
    );
  }

  return results;
}

/**
 * 指定ユーザーの未解決 Lint findings を取得する。
 * Fetches unresolved lint findings for the specified user.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns 未解決の findings / Unresolved findings
 */
export async function getUnresolvedFindings(ownerId: string, db: Database) {
  return db
    .select()
    .from(lintFindings)
    .where(and(eq(lintFindings.ownerId, ownerId), isNull(lintFindings.resolvedAt)))
    .orderBy(lintFindings.createdAt);
}

/**
 * 指定ページに関連する未解決 Lint findings を取得する。
 * Fetches unresolved lint findings related to the specified page.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param pageId - 対象ページ ID / Target page ID
 * @param db - データベース接続 / Database connection
 * @returns 該当ページに関連する findings / Findings related to the page
 */
export async function getFindingsForPage(ownerId: string, pageId: string, db: Database) {
  const all = await getUnresolvedFindings(ownerId, db);
  return all.filter((f) => f.pageIds.includes(pageId));
}

/**
 * Finding を解決済みにマークする。
 * Marks a finding as resolved.
 *
 * @param findingId - Finding ID
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns 更新された finding（見つからない場合は null） / Updated finding or null
 */
export async function resolveFinding(findingId: string, ownerId: string, db: Database) {
  const [updated] = await db
    .update(lintFindings)
    .set({ resolvedAt: new Date() })
    .where(and(eq(lintFindings.id, findingId), eq(lintFindings.ownerId, ownerId)))
    .returning();
  return updated ?? null;
}
