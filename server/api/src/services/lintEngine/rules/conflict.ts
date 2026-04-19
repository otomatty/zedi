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
// 数値パターン:
//   - `\d[\d,.]*` は `1`, `1,000`, `3.14` 等を吸収。`*` (not `+`) なので 1 桁
//     の主張 `3人` / `7km` / `5年` も取りこぼさない。
//   - `(?: \d{3})*` で「半角スペース + 3 桁」の繰り返しを許容し、thousand-
//     grouping の別表記 `1 000 円` / `1 000 000 円` を吸収する。
//     ASCII スペース以外は受けない（`100 3人` のような偽マッチを避けるため、
//     3 桁ずつでないと拾わない）。
// Numeric pattern:
//   - `\d[\d,.]*` matches `1`, `1,000`, `3.14`, etc. Using `*` (not `+`) keeps
//     single-digit claims (`3人` / `7km` / `5年`) from being dropped.
//   - `(?: \d{3})*` accepts space-grouped thousands (`1 000 円` /
//     `1 000 000 円`). Requiring exactly 3 digits after each space prevents
//     false grouping like `100 3人` → `1003人`.
const NUMBER_PATTERN = /(\d[\d,.]*(?: \d{3})*)\s*(km|m|kg|g|人|円|ドル|年|歳|万|億)/g;

/**
 * 日付値を `YYYY-M-D` (パディングなし) に正規化する。`2026-04-19` と
 * `2026/4/19`、`2026年4月19日` を同一として扱うため。
 *
 * Normalize a matched date string into `YYYY-M-D` so format-only variants
 * (`2026-04-19` vs `2026/4/19` vs `2026年4月19日`) collapse to the same value
 * and don't trigger false `conflict` findings.
 */
function normalizeDateValue(raw: string): string {
  const m = raw.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (!m) return raw;
  const year = String(parseInt(m[1] ?? "0", 10));
  const month = String(parseInt(m[2] ?? "0", 10));
  const day = String(parseInt(m[3] ?? "0", 10));
  return `${year}-${month}-${day}`;
}

/**
 * 数値値を canonical な `<number><unit>` 形式に正規化する。
 * - 区切り文字（カンマ・空白）を除去
 * - 単位を末尾から切り出して `parseFloat` で数値化し、末尾ゼロや `.0` を畳む
 *   （`1,000円` / `1000円` / `1 000 円` / `1000.0円` → すべて `1000円`）
 *
 * Normalize a matched number+unit string to a canonical `<number><unit>` form.
 * Thousands separators (comma/space) are stripped and the numeric portion is
 * run through `parseFloat` so format-only variants — separators as well as
 * trailing decimal zeros (`1000` vs `1000.0`) — all collapse to one value.
 *
 * NOTE: 入力は常に日本語 / 英語圏の表記 (`.` = 小数点、`,` = 千単位) を前提
 * とする。ロケール別のカンマ=小数点は対象外（`lintEngine` は現状日本語
 * コンテンツ向けのため）。
 */
function normalizeNumberValue(raw: string): string {
  const stripped = raw.replace(/[,\s]+/g, "");
  const unitMatch = stripped.match(/(km|m|kg|g|人|円|ドル|年|歳|万|億)$/);
  if (!unitMatch) return stripped.toLowerCase();
  const unit = unitMatch[0];
  const numeric = stripped.slice(0, -unit.length);
  const parsed = Number.parseFloat(numeric);
  if (!Number.isFinite(parsed)) return stripped.toLowerCase();
  // `String(Number)` は末尾ゼロを自動で落とす（例: `1000.0` → `1000`）。
  // `String(Number)` naturally drops trailing decimal zeros.
  return `${parsed}${unit.toLowerCase()}`;
}

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
      // 値は YYYY-M-D に正規化して保存し、format 違いで偽陽性が出ないようにする。
      // Persist the normalized canonical value so format-only differences don't
      // produce false `conflict` findings.
      facts.push({ key: contextKey, value: normalizeDateValue(match[0]) });
    }
  }

  // 数値ファクト / Numeric facts
  const numRegex = new RegExp(NUMBER_PATTERN.source, "g");
  while ((match = numRegex.exec(text)) !== null) {
    const context = text.substring(Math.max(0, match.index - 20), match.index).trim();
    const contextKey = context.split(/\s+/).slice(-3).join(" ");
    if (contextKey) {
      facts.push({ key: contextKey, value: normalizeNumberValue(match[0]) });
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
