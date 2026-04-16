import { eq, and } from "drizzle-orm";
import { pages } from "../../../schema/pages.js";
import type { Database } from "../../../types/index.js";
import type { LintRuleResult, LintFindingCandidate } from "../types.js";

/**
 * タイトル間の Levenshtein 距離を計算する。
 * Computes Levenshtein distance between two strings.
 *
 * @param a - 文字列 A / String A
 * @param b - 文字列 B / String B
 * @returns 編集距離 / Edit distance
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

/**
 * 類似度の閾値。タイトル長の短い方に対する比率。
 * Similarity threshold as a ratio of the shorter title length.
 */
const SIMILARITY_RATIO = 0.3;

/**
 * タイトル類似検出ルール。
 * Levenshtein 距離で潜在的な重複タイトルを検出する。
 *
 * Title similarity detection rule.
 * Uses Levenshtein distance to find potentially duplicate titles.
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns タイトル類似の検出結果 / Title similarity findings
 */
export async function runTitleSimilarRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  const allPages = await db
    .select({ id: pages.id, title: pages.title })
    .from(pages)
    .where(and(eq(pages.ownerId, ownerId), eq(pages.isDeleted, false)));

  const titled = allPages.filter((p) => p.title && p.title.trim().length > 0);
  const findings: LintFindingCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < titled.length; i++) {
    for (let j = i + 1; j < titled.length; j++) {
      const a = titled[i];
      const b = titled[j];
      const titleA = (a.title ?? "").trim().toLowerCase();
      const titleB = (b.title ?? "").trim().toLowerCase();

      if (titleA === titleB) continue; // exact dup handled elsewhere

      const minLen = Math.min(titleA.length, titleB.length);
      if (minLen === 0) continue;

      const dist = levenshtein(titleA, titleB);
      const threshold = Math.max(1, Math.floor(minLen * SIMILARITY_RATIO));

      if (dist <= threshold) {
        const key = [a.id, b.id].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);

        findings.push({
          rule: "title_similar",
          severity: "info",
          pageIds: [a.id, b.id],
          detail: {
            titleA: a.title,
            titleB: b.title,
            distance: dist,
            suggestion: `タイトルが類似しています。統合を検討してください / Titles are similar. Consider merging.`,
          },
        });
      }
    }
  }

  return { rule: "title_similar", findings };
}
