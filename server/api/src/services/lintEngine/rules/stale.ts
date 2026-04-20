/**
 * Stale claim detection rule (P4, otomatty/zedi#598).
 *
 * A page is flagged as "stale" when any source cited by it
 * (`page_sources` → `sources`) has been re-extracted *after* the page itself
 * was last updated. This means the underlying reference material moved on
 * but the wiki entry summarizing it did not.
 *
 * Stale claim 検出ルール。
 * あるページが引用しているソース（`page_sources` → `sources`）のうち、
 * `sources.extracted_at` が `pages.updated_at` より新しいものがある場合、
 * 「出典は更新されたのに Wiki 本体が追随できていない」状態とみなして
 * Stale finding を生成する。
 */
import { sql } from "drizzle-orm";
import type { Database } from "../../../types/index.js";
import type { LintFindingCandidate, LintRuleResult } from "../types.js";

/**
 * Raw row returned by the stale detection query.
 * 検出クエリが返す 1 行。
 */
export type StaleRow = {
  page_id: string;
  title: string | null;
  page_updated_at: Date;
  source_id: string;
  source_title: string | null;
  source_url: string | null;
  source_extracted_at: Date;
} & Record<string, unknown>;

/**
 * Pure helper that folds stale rows into candidate findings.
 * One finding per page, with all stale sources listed (sorted by most
 * recently extracted first).
 *
 * 検出行を findings に折り畳む純関数。ページごとに 1 finding、
 * 古いソースは `staleSources` 配列に最新抽出順で含める。
 *
 * @param rows - Stale rows / 検出行
 * @returns Candidate findings / 候補 findings
 */
export function foldStaleRowsIntoFindings(rows: ReadonlyArray<StaleRow>): LintFindingCandidate[] {
  const byPage = new Map<
    string,
    {
      pageId: string;
      title: string | null;
      pageUpdatedAt: Date;
      sources: Array<{ id: string; title: string | null; url: string | null; extractedAt: Date }>;
    }
  >();

  for (const row of rows) {
    const src = {
      id: row.source_id,
      title: row.source_title,
      url: row.source_url,
      extractedAt: row.source_extracted_at,
    };
    const entry = byPage.get(row.page_id);
    if (entry) {
      entry.sources.push(src);
    } else {
      byPage.set(row.page_id, {
        pageId: row.page_id,
        title: row.title,
        pageUpdatedAt: row.page_updated_at,
        sources: [src],
      });
    }
  }

  return [...byPage.values()].map((p) => ({
    rule: "stale" as const,
    severity: "warn" as const,
    pageIds: [p.pageId],
    detail: {
      title: p.title ?? "(無題 / untitled)",
      pageUpdatedAt: p.pageUpdatedAt.toISOString(),
      staleSources: [...p.sources]
        .sort((a, b) => b.extractedAt.getTime() - a.extractedAt.getTime())
        .map((s) => ({
          sourceId: s.id,
          title: s.title,
          url: s.url,
          extractedAt: s.extractedAt.toISOString(),
        })),
      suggestion:
        "出典が更新されています。ページ本文の見直しを検討してください / Linked source has been re-extracted after this page's last update. Please review.",
    },
  }));
}

/**
 * Detects pages whose linked sources have been re-extracted since the page
 * was last updated.
 *
 * 引用元ソースがページより後に再抽出されている場合を検出する。
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns Stale 検出結果 / Stale findings
 */
export async function runStaleRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  // Raw SQL: a date-compared JOIN across page_sources + sources is simpler here,
  // and avoids pulling down pages+contents blobs.
  // raw SQL で JOIN する理由は、日付比較付きの結合が素直になるため。
  const result = await db.execute<StaleRow>(sql`
    SELECT
      p.id AS page_id,
      p.title AS title,
      p.updated_at AS page_updated_at,
      s.id AS source_id,
      s.title AS source_title,
      s.url AS source_url,
      s.extracted_at AS source_extracted_at
    FROM pages p
    INNER JOIN page_sources ps ON ps.page_id = p.id
    INNER JOIN sources s ON s.id = ps.source_id
    WHERE p.owner_id = ${ownerId}
      AND p.is_deleted = false
      AND s.extracted_at > p.updated_at
  `);

  const findings = foldStaleRowsIntoFindings(result.rows);
  return { rule: "stale", findings };
}
