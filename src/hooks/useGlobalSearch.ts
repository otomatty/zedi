import { useState, useMemo } from "react";
import i18n from "@/i18n";
import { useSearchPages, useSearchSharedNotes } from "./usePageQueries";
import { useDebouncedValue } from "./useDebouncedValue";
import { extractPlainText } from "@/lib/contentUtils";
import {
  type MatchType,
  parseSearchQuery,
  determineMatchType,
  extractSmartSnippet,
  highlightKeywords,
  calculateEnhancedScore,
} from "@/lib/searchUtils";
import type { Page } from "@/types/page";
import type {
  SearchPageResultRow,
  SearchPdfHighlightResultRow,
  SearchResultRow,
} from "@/lib/api/types";

/**
 * Issue #864: PDF ハイライト本文ヒットの相対スコア基準点。
 * 「タイトル一致 \> 派生ページ一致 \> ハイライト本文一致」の序列を維持するため、
 * 既存のページ系結果より必ず下位に来るよう負値を採る。
 *
 * 既存値: 個人ページ title 100+ / content 30+ / 共有ページ (レガシー) 0。
 * 派生ページ自体は通常のページ検索で拾われ、そこで title/both/content の
 * スコアが付くので、本値より必ず上位に並ぶ。
 *
 * Issue #864: base score for a PDF highlight body match. We use a negative
 * value so highlight rows always sort below every page-shaped result and the
 * documented priority — title \> derived page \> highlight body — is preserved.
 *
 * Existing scores (for context): personal title 100+, personal content 30+,
 * shared rows legacy 0. Derived pages still appear via the regular page
 * search and pick up their normal title/content scores, so they outrank
 * highlight rows even when both reference the same passage.
 */
export const PDF_HIGHLIGHT_BASE_SCORE = -10;

type SharedResultRow = SearchResultRow;

/**
 * Issue #718 Phase 5-4 の dedup 契約を一箇所に集約するヘルパー。
 *
 * `scope=shared` レスポンスは以下の 3 種類のページを返す
 * (`server/api/src/routes/search.ts`):
 *
 *  1. 呼び出し元自身の個人ページ (`owner_id = me AND note_id IS NULL`)
 *  2. ノートメンバーシップ / オーナーシップ経由で見えるリンク済み個人ページ
 *     (`note_pages` 経由、他ユーザー所有の `note_id IS NULL` ページも含み得る)
 *  3. ノートネイティブページ (`note_id IS NOT NULL`)
 *
 * IDB は (1) しか持たないので、ここでは「`useSearchPages` で既に出ている page
 * id」を集合で受け取り、それと一致する shared 行だけを落とす。`note_id` の
 * null/non-null では判定しない (それだと (2) のリンク済み個人ページが脱落する。
 * Codex 指摘)。
 *
 * Centralizes the Phase 5-4 dedup contract. `scope=shared` returns three kinds
 * of rows: (1) the caller's own personal pages, (2) linked personal pages
 * visible through note membership or ownership (these may belong to other
 * users and can have `note_id IS NULL`), and (3) note-native pages. IDB only
 * holds (1), so we dedup against the personal page id set instead of using
 * `note_id` as a proxy — otherwise (2) would silently disappear (Codex
 * review).
 *
 * Issue #864: PDF ハイライト行 (`kind="pdf_highlight"`) は別エンティティで個人
 * ページとは重複しないため、`page` 種別だけを dedup の対象とする。
 *
 * Issue #864: PDF highlight rows are a separate entity, so the dedup pass
 * only applies to `kind="page"` rows.
 *
 * @param rows - shared 検索 API のレスポンス行 / Rows from the shared search API.
 * @param personalIds - `useSearchPages` (IDB) で既に出ている page id の集合 /
 *   Set of page ids already present in personal search results.
 */
export function dedupSharedRowsAgainstPersonal<T extends SearchResultRow>(
  rows: readonly T[],
  personalIds: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => {
    if (r.kind !== "page") return true;
    return !personalIds.has(r.id);
  });
}

/**
 *
 */
export interface SearchResult {
  page: Page;
  matchedText: string;
  highlightedText: string;
  matchType: MatchType;
  score: number;
}

/**
 * 共通のグローバル検索結果フィールド。
 * Common fields shared across kinds.
 */
interface GlobalSearchResultBase {
  title: string;
  highlightedText: string;
  matchType: MatchType;
}

/**
 * 通常のページ結果（個人ページ / ノートネイティブ）。Issue #864 までの既存形。
 * Page-kind result (personal or note-native) — the historical shape.
 */
export interface GlobalSearchPageResultItem extends GlobalSearchResultBase {
  kind: "page";
  pageId: string;
  /** 共有ノート結果で設定される。Set for shared-note results; navigate to /notes/:noteId/:pageId. */
  noteId?: string;
  sourceUrl?: string;
}

/**
 * Issue #864: PDF ローカルソースのハイライト本文一致結果。
 * Issue #864: a `pdf_highlights.text` match against a local PDF source.
 */
export interface GlobalSearchPdfHighlightResultItem extends GlobalSearchResultBase {
  kind: "pdf_highlight";
  highlightId: string;
  sourceId: string;
  /** 表示名（`sources.display_name` / `title` / フォールバック）。Display name. */
  sourceDisplayName: string;
  pdfPage: number;
  /** 派生 Zedi ページ ID（あればクリック時にそちらへ優先遷移）。Optional derived page id. */
  derivedPageId: string | null;
}

/**
 * 統一されたグローバル検索結果アイテム（discriminated union）。
 * Unified discriminated union for global search results.
 */
export type GlobalSearchResultItem =
  | GlobalSearchPageResultItem
  | GlobalSearchPdfHighlightResultItem;

/**
 * Search pages by query with multiple keyword support
 * Exported for testing
 */
export function searchPages(pages: Page[], query: string): SearchResult[] {
  if (!query.trim()) return [];

  // スペースで分割して複数キーワードに対応
  const keywords = parseSearchQuery(query);

  if (keywords.length === 0) return [];

  return pages
    .filter((page) => {
      if (page.isDeleted) return false;

      const title = page.title.toLowerCase();
      const content = extractPlainText(page.content).toLowerCase();

      // すべてのキーワードがタイトルまたはコンテンツに含まれる（AND検索）
      return keywords.every(
        (keyword) =>
          title.includes(keyword.toLowerCase()) || content.includes(keyword.toLowerCase()),
      );
    })
    .map((page) => {
      const content = extractPlainText(page.content);

      // マッチタイプを判定
      const matchType = determineMatchType(page.title, content, keywords, query);

      // スコア計算
      const score = calculateEnhancedScore(page, keywords, matchType);

      // スマートスニペット生成
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);

      return { page, matchedText, highlightedText, matchType, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/**
 * PR #873 review (Gemini): PDF ハイライト行の i18n タイトル / snippet 抽出 /
 * ハイライト本文整形ロジックを単一の helper に集約する。`buildPdfHighlightItem`
 * とフル検索画面 (`SearchResults.tsx`) の両方がこれを共有する。i18n 関数を
 * 引数化することで、ヘッダードロップダウン側 (i18next の `i18n.t`) と
 * フル検索画面側 (react-i18next の `useTranslation` の `t`) の両方で使える。
 *
 * PR #873 review (Gemini): centralize the i18n title / snippet extraction /
 * highlight formatting so the header dropdown (`buildPdfHighlightItem`) and
 * the full search page (`SearchResults.tsx`) share one implementation. The
 * translator function is injected so callers can pass either i18next's global
 * `i18n.t` or the `t` from `useTranslation`.
 *
 * @param row - サーバから返ってきた PDF ハイライト行。Highlight row from the API.
 * @param keywords - 検索キーワード配列。Parsed search keywords.
 * @param translate - i18n キー解決関数。Translator function.
 * @param snippetLength - スニペット最大長（既定 120）。Snippet max length (default 120).
 */
export function formatPdfHighlightDisplay(
  row: SearchPdfHighlightResultRow,
  keywords: string[],
  translate: (key: string, options?: Record<string, unknown>) => string,
  snippetLength = 120,
): {
  displayName: string;
  title: string;
  snippet: string;
  highlightedText: string;
} {
  const snippet = extractSmartSnippet(row.text, keywords, snippetLength);
  const highlightedText = highlightKeywords(snippet, keywords);
  const displayName =
    (row.source_display_name?.trim() || row.source_title?.trim() || null) ??
    translate("common.pdfHighlightFallbackName", { defaultValue: "PDF" });

  // 表示用タイトル: `<file> (p.<page>)`。i18n リソースが無い環境では英語フォールバック。
  // Display title: `<file> (p.<page>)`; falls back to English when i18n missing.
  const title = translate("common.pdfHighlightResultTitle", {
    defaultValue: "{{file}} (p.{{page}})",
    file: displayName,
    page: row.pdf_page,
  });

  return { displayName, title, snippet, highlightedText };
}

/**
 * Issue #864: PDF ハイライト行を表示用の `GlobalSearchPdfHighlightResultItem` に変換する。
 *
 * Converts a server `kind="pdf_highlight"` row into the discriminated UI shape.
 * Exported so the snippet / title build-out is easy to unit-test without a
 * React Query harness. Shared formatting lives in
 * {@link formatPdfHighlightDisplay} (PR #873 review: Gemini).
 */
export function buildPdfHighlightItem(
  row: SearchPdfHighlightResultRow,
  keywords: string[],
): GlobalSearchPdfHighlightResultItem & { score: number } {
  const { displayName, title, highlightedText } = formatPdfHighlightDisplay(
    row,
    keywords,
    (key, options) => i18n.t(key, options),
  );

  return {
    kind: "pdf_highlight",
    highlightId: row.highlight_id,
    sourceId: row.source_id,
    sourceDisplayName: displayName,
    pdfPage: row.pdf_page,
    derivedPageId: row.derived_page_id,
    title,
    highlightedText,
    matchType: "content",
    score: PDF_HIGHLIGHT_BASE_SCORE,
  };
}

/**
 * 個人ページ (IDB) と shared 検索結果 (API) を統合してグローバル検索結果に
 * 整形する pure 関数。`useGlobalSearch` がメモ化して呼ぶが、振る舞いを
 * 単独でテストできるようエクスポートする (Issue #718 Phase 5-4)。
 *
 * Pure helper that fuses personal-IDB results and the shared API response
 * into the unified `GlobalSearchResultItem` list rendered in the search UI.
 * Exported so the dedup behavior can be tested without spinning up React
 * Query (Issue #718 Phase 5-4).
 *
 * **Dedup contract**: dedup is by `pageId` against the personal id set —
 * see {@link dedupSharedRowsAgainstPersonal}. We can't filter by `note_id`
 * alone because the server's `scope=shared` SQL returns linked personal
 * pages (other users' `note_id IS NULL` pages reachable via `note_pages`)
 * that are NOT covered by IDB.
 *
 * **重複排除の契約**: dedup は `pageId` 一致でのみ行う
 * ({@link dedupSharedRowsAgainstPersonal})。`note_id IS NULL` の中には IDB に
 * 載っていないリンク済み個人ページが混ざるので、`note_id` での絞り込みは不可。
 *
 * Issue #864: shared 結果には `kind="pdf_highlight"` 行も混ざる。dedup は
 * `kind="page"` のみに作用し、ハイライトはスコア順序を保ったまま末尾に並ぶ。
 *
 * Issue #864: shared results now also include `kind="pdf_highlight"` rows.
 * The dedup pass leaves them alone (they aren't represented in IDB) and they
 * sort into the final list by score, which places them after title/content
 * page matches by design.
 */
export function buildGlobalSearchResults(
  personalPages: Page[],
  sharedRows: SharedResultRow[],
  query: string,
  keywords: string[],
  limit = 10,
): GlobalSearchResultItem[] {
  if (query.trim().length < 3 || keywords.length === 0) return [];

  // 中間 sort は不要（最後にまとめて score 降順で並べ直す）。Gemini レビュー指摘。
  // No intermediate sort here — the final merge sorts by score (Gemini review).
  const personal: Array<GlobalSearchPageResultItem & { score: number }> = personalPages
    .filter((page) => !page.isDeleted)
    .map((page) => {
      const content = extractPlainText(page.content);
      const matchType = determineMatchType(page.title, content, keywords, query);
      const score = calculateEnhancedScore(page, keywords, matchType);
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);
      return {
        kind: "page",
        pageId: page.id,
        title: page.title || i18n.t("common.untitledPage"),
        highlightedText,
        matchType,
        sourceUrl: page.sourceUrl,
        score,
      };
    });

  const personalIds = new Set(personal.map((p) => p.pageId));
  const dedupedShared = dedupSharedRowsAgainstPersonal(sharedRows, personalIds);

  const sharedPages: Array<GlobalSearchPageResultItem & { score: number }> = dedupedShared
    .filter((r): r is SearchPageResultRow => r.kind === "page")
    .map((r) => {
      const preview = r.content_preview ?? "";
      const highlightedText = highlightKeywords(preview, keywords);
      return {
        kind: "page",
        pageId: r.id,
        // ノートネイティブ / リンク済みノート所属ページのみ /notes ルーティングに乗せる。
        // 単なるリンク済み個人ページ (`note_id IS NULL`) は note 側に飛ばさず /pages へ。
        // Only note-native rows route under /notes; bare linked personal rows
        // (`note_id IS NULL`) keep the personal /pages destination.
        noteId: r.note_id ?? undefined,
        title: r.title?.trim() ? r.title : i18n.t("common.untitledPage"),
        highlightedText: highlightedText || i18n.t("common.sharedNoteContext"),
        matchType: "content" as MatchType,
        sourceUrl: r.source_url ?? undefined,
        score: 0,
      };
    });

  const sharedHighlights: Array<GlobalSearchPdfHighlightResultItem & { score: number }> =
    dedupedShared
      .filter((r): r is SearchPdfHighlightResultRow => r.kind === "pdf_highlight")
      .map((r) => buildPdfHighlightItem(r, keywords));

  return [...personal, ...sharedPages, ...sharedHighlights]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...item }) => item);
}

/**
 * Hook for global search functionality (C3-8: personal + shared merged).
 *
 * - Personal: StorageAdapter.searchPages via useSearchPages().
 * - Shared: apiClient.searchSharedNotes via useSearchSharedNotes().
 * - Merge / dedup is delegated to {@link buildGlobalSearchResults}.
 */
export function useGlobalSearch() {
  const [query, setQuery] = useState("");

  const debouncedQuery = useDebouncedValue(query, 150);

  const { data: serverSearchResults = [] } = useSearchPages(debouncedQuery);
  const { data: sharedResponse } = useSearchSharedNotes(debouncedQuery);
  const sharedResults = sharedResponse?.results ?? [];

  const keywords = useMemo(() => parseSearchQuery(debouncedQuery), [debouncedQuery]);

  const searchResults = useMemo(
    (): GlobalSearchResultItem[] =>
      buildGlobalSearchResults(serverSearchResults, sharedResults, debouncedQuery, keywords),
    [serverSearchResults, sharedResults, debouncedQuery, keywords],
  );

  return {
    query,
    setQuery,
    searchResults,
    hasQuery: query.trim().length >= 3,
  };
}
