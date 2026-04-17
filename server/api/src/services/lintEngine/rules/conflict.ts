import { eq, and } from "drizzle-orm";
import { pages } from "../../../schema/pages.js";
import { pageContents } from "../../../schema/pageContents.js";
import type { Database } from "../../../types/index.js";
import type { LintRuleResult, LintFindingCandidate } from "../types.js";

/**
 * 数値・日付パターン抽出用の正規表現。
 * Regex patterns for extracting numeric/date claims from content.
 */
const DATE_PATTERN = /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日]?/g;
// `\d[\d,.]*` (not `+`) so single-digit claims like `3人` / `7km` / `5年` are
// matched. `+` would require at least two numeric characters.
// `+` だと 2 文字以上必要になり 1 桁の主張 (3人 等) を取りこぼすため `*` を使う。
const NUMBER_PATTERN = /(\d[\d,.]*)\s*(km|m|kg|g|人|円|ドル|年|歳|万|億)/g;

/**
 * テキストからファクト（数値・日付の主張）を抽出する。
 * Extracts factual claims (numbers, dates) from text content.
 *
 * @param text - 対象テキスト / Source text
 * @returns 抽出されたファクト一覧 / Extracted facts
 */
export function extractFacts(text: string): Array<{ key: string; value: string }> {
  const facts: Array<{ key: string; value: string }> = [];

  // 日付ファクト / Date facts
  let match: RegExpExecArray | null;
  const dateRegex = new RegExp(DATE_PATTERN.source, "g");
  while ((match = dateRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, match.index - 20), match.index).trim();
    const contextKey = context.split(/\s+/).slice(-3).join(" ");
    if (contextKey) {
      facts.push({ key: contextKey, value: match[0] });
    }
  }

  // 数値ファクト / Numeric facts
  const numRegex = new RegExp(NUMBER_PATTERN.source, "g");
  while ((match = numRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, match.index - 20), match.index).trim();
    const contextKey = context.split(/\s+/).slice(-3).join(" ");
    if (contextKey) {
      facts.push({ key: contextKey, value: match[0] });
    }
  }

  return facts;
}

/**
 * 矛盾検出ルール。
 * 同じコンテキストで異なる数値・日付が使用されている場合を検出する。
 * （LLM 判定は将来的に追加。現在はパターンマッチで検出）
 *
 * Conflict detection rule.
 * Detects inconsistent numeric/date claims across pages.
 * (LLM-based detection to be added later. Currently uses pattern matching.)
 *
 * @param ownerId - 対象ユーザー ID / Target user ID
 * @param db - データベース接続 / Database connection
 * @returns 矛盾の検出結果 / Conflict findings
 */
export async function runConflictRule(ownerId: string, db: Database): Promise<LintRuleResult> {
  const pagesWithContent = await db
    .select({
      id: pages.id,
      title: pages.title,
      contentText: pageContents.contentText,
    })
    .from(pages)
    .innerJoin(pageContents, eq(pages.id, pageContents.pageId))
    .where(and(eq(pages.ownerId, ownerId), eq(pages.isDeleted, false)));

  // ファクトをキーで集約 / Group facts by key
  const factMap = new Map<string, Array<{ pageId: string; title: string; value: string }>>();

  for (const page of pagesWithContent) {
    if (!page.contentText) continue;
    const facts = extractFacts(page.contentText);
    for (const fact of facts) {
      const normalizedKey = fact.key.toLowerCase();
      const existing = factMap.get(normalizedKey) ?? [];
      if (!factMap.has(normalizedKey)) {
        factMap.set(normalizedKey, existing);
      }
      existing.push({
        pageId: page.id,
        title: page.title ?? "(無題 / untitled)",
        value: fact.value,
      });
    }
  }

  // 同一キーに異なる値がある場合を検出 / Detect differing values for same key
  const findings: LintFindingCandidate[] = [];

  for (const [key, entries] of factMap) {
    if (entries.length < 2) continue;

    const uniqueValues = new Set(entries.map((e) => e.value));
    if (uniqueValues.size <= 1) continue;

    const pageIds = [...new Set(entries.map((e) => e.pageId))];
    if (pageIds.length < 2) continue;

    findings.push({
      rule: "conflict",
      severity: "warn",
      pageIds,
      detail: {
        factKey: key,
        claims: entries.map((e) => ({
          pageId: e.pageId,
          title: e.title,
          value: e.value,
        })),
        suggestion:
          "同じ事柄に異なる値が記載されています。確認してください / Different values found for the same fact. Please verify.",
      },
    });
  }

  return { rule: "conflict", findings };
}
