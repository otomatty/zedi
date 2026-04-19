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
  // prev と curr の 2 行だけで DP を回す（型安全かつ省メモリ）
  // Use two rows for DP (type-safe and memory efficient)
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n] ?? 0;
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
    const a = titled[i];
    if (!a) continue;
    for (let j = i + 1; j < titled.length; j++) {
      const b = titled[j];
      if (!b) continue;
      const titleA = (a.title ?? "").trim().toLowerCase();
      const titleB = (b.title ?? "").trim().toLowerCase();

      const minLen = Math.min(titleA.length, titleB.length);
      if (minLen === 0) continue;

      // 完全一致 (distance=0) は最も強い類似ケースなので別ルールで握り潰さず
      // ここで `info` として報告する。以前はコメントで「他で処理する」と書かれて
      // いたが実際にはどこも見ていなかったため、完全一致が黙って素通りしていた。
      // Treat exact-title pairs as the strongest title_similar case rather than
      // assuming a separate rule handles them — there is no such rule today.
      const dist = levenshtein(titleA, titleB);
      const threshold = Math.max(1, Math.floor(minLen * SIMILARITY_RATIO));

      if (dist <= threshold) {
        const key = [a.id, b.id].sort().join(":");
        if (seen.has(key)) continue;
        seen.add(key);

        // 完全一致 (distance=0) はリンクの曖昧さを生む深刻な重複なので
        // `warn` に上げ、近似類似 (distance>0) は `info` のまま残す。
        // Exact-title duplicates (distance=0) create link ambiguity and are
        // more serious than near-matches, so escalate severity to `warn`.
        const severity = dist === 0 ? "warn" : "info";
        const suggestion =
          dist === 0
            ? "タイトルが完全に一致しています。統合またはリネームを検討してください / Titles are identical. Consider merging or renaming."
            : "タイトルが類似しています。統合を検討してください / Titles are similar. Consider merging.";

        findings.push({
          rule: "title_similar",
          severity,
          pageIds: [a.id, b.id],
          detail: {
            titleA: a.title,
            titleB: b.title,
            distance: dist,
            suggestion,
          },
        });
      }
    }
  }

  return { rule: "title_similar", findings };
}
