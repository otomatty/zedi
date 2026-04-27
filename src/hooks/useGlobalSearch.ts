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
import type { SearchSharedResponse } from "@/lib/api/types";

type SharedResultRow = SearchSharedResponse["results"][number];

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
 * @param rows shared 検索 API のレスポンス行 / Rows from the shared search API.
 * @param personalIds `useSearchPages` (IDB) で既に出ている page id の集合 /
 *   Set of page ids already present in personal search results.
 */
export function dedupSharedRowsAgainstPersonal<T extends { id: string }>(
  rows: readonly T[],
  personalIds: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => !personalIds.has(r.id));
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

/** Unified item for global search (personal + shared). C3-8. */
export interface GlobalSearchResultItem {
  pageId: string;
  /** 共有ノート結果で設定される。Set for shared-note results; navigate to /notes/:noteId/:pageId. */
  noteId?: string;
  title: string;
  highlightedText: string;
  matchType: MatchType;
  sourceUrl?: string;
}

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
  const personal: Array<GlobalSearchResultItem & { score: number }> = personalPages
    .filter((page) => !page.isDeleted)
    .map((page) => {
      const content = extractPlainText(page.content);
      const matchType = determineMatchType(page.title, content, keywords, query);
      const score = calculateEnhancedScore(page, keywords, matchType);
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);
      return {
        pageId: page.id,
        title: page.title || i18n.t("common.untitledPage"),
        highlightedText,
        matchType,
        sourceUrl: page.sourceUrl,
        score,
      };
    });

  const personalIds = new Set(personal.map((p) => p.pageId));
  const shared: Array<GlobalSearchResultItem & { score: number }> = dedupSharedRowsAgainstPersonal(
    sharedRows,
    personalIds,
  ).map((r) => {
    const preview = r.content_preview ?? "";
    const highlightedText = highlightKeywords(preview, keywords);
    return {
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

  return [...personal, ...shared]
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
