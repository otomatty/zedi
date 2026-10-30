import { useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/Container";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type { SearchResultCardPageItem } from "@/components/search/SearchResultCard";
import { SearchResultsLoadingSkeleton } from "@/components/search/SearchResultsLoadingSkeleton";
import { SearchResultsEmptyState } from "@/components/search/SearchResultsEmptyState";
import { useSearchPages, useSearchSharedNotes } from "@/hooks/pages/usePageQueries";
import { extractPlainText } from "@/lib/contentUtils";
import {
  type MatchType,
  parseSearchQuery,
  determineMatchType,
  extractSmartSnippet,
  highlightKeywords,
  calculateEnhancedScore,
} from "@/lib/searchUtils";
import { resolveSearchResultUrl, useGlobalSearchContext } from "@/contexts/GlobalSearchContext";
import { dedupSharedRowsAgainstPersonal } from "@/hooks/search/useGlobalSearch";
import type { SearchPageResultRow } from "@/lib/api/types";

type PageSearchResultItem = SearchResultCardPageItem & {
  snippet: string;
  score: number;
};

type SearchResultItem = PageSearchResultItem;

/**
 * Renders global search results for the `q` query string (personal pages and shared notes).
 *
 * クエリ `q` に対するグローバル検索結果（個人ページと共有ノート）を表示する。
 */
export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setQuery } = useGlobalSearchContext();
  const searchQuery = (searchParams.get("q") ?? "").trim();

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery, setQuery]);

  const { data: personalResults = [], isLoading: isPersonalLoading } = useSearchPages(searchQuery);
  const { data: sharedResponse, isLoading: isSharedLoading } = useSearchSharedNotes(searchQuery);

  const isLoading = isPersonalLoading || isSharedLoading;
  const keywords = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  const sharedResults = useMemo(() => sharedResponse?.results ?? [], [sharedResponse]);

  const results = useMemo((): SearchResultItem[] => {
    if (searchQuery.length < 3 || keywords.length === 0) return [];

    const personal: PageSearchResultItem[] = personalResults
      .filter((page) => !page.isDeleted)
      .map((page) => {
        const content = extractPlainText(page.content);
        const matchType = determineMatchType(page.title, content, keywords, searchQuery);
        const score = calculateEnhancedScore(page, keywords, matchType);
        const snippet = extractSmartSnippet(content, keywords, 200);
        const highlightedSnippet = highlightKeywords(snippet, keywords);
        return {
          kind: "page",
          pageId: page.id,
          noteId: page.noteId,
          isShared: false,
          title: page.title || t("common.untitledPage"),
          snippet,
          highlightedSnippet,
          matchType,
          sourceUrl: page.sourceUrl,
          thumbnailUrl: page.thumbnailUrl,
          updatedAt: page.updatedAt,
          score,
        };
      });

    // Issue #718 Phase 5-4: dedup 契約は `dedupSharedRowsAgainstPersonal` に集約。
    // ローカル (IDB) 検索で既に出ている page id だけを shared から落とす。
    //
    // Issue #718 Phase 5-4: dedup is centralized in
    // `dedupSharedRowsAgainstPersonal` and works by `pageId` against the
    // local (IDB) result set.
    const personalIds = new Set(personal.map((item) => item.pageId));
    const dedupedShared = dedupSharedRowsAgainstPersonal(sharedResults, personalIds);

    const sharedPages: PageSearchResultItem[] = dedupedShared.map((r: SearchPageResultRow) => {
      const preview = r.content_preview ?? "";
      const snippet = extractSmartSnippet(preview, keywords, 200);
      const highlightedSnippet = highlightKeywords(
        snippet || t("common.sharedNoteContext"),
        keywords,
      );
      return {
        kind: "page",
        pageId: r.id,
        noteId: r.note_id,
        isShared: true,
        title: r.title?.trim() ? r.title : t("common.untitledPage"),
        snippet,
        highlightedSnippet,
        matchType: "content" as MatchType,
        sourceUrl: r.source_url ?? undefined,
        thumbnailUrl: r.thumbnail_url ?? undefined,
        updatedAt: new Date(r.updated_at).getTime(),
        score: 0,
      };
    });

    return [...personal, ...sharedPages].sort((a, b) => b.score - a.score);
  }, [personalResults, sharedResults, searchQuery, keywords, t]);

  /**
   * Navigates to the clicked result. URL composition is shared with the header
   * dropdown via `resolveSearchResultUrl`.
   *
   * クリックされた結果へ遷移する。URL 組み立てはヘッダードロップダウンと共通。
   */
  const handleResultClick = (item: SearchResultItem) => {
    navigate(
      resolveSearchResultUrl({
        kind: "page",
        pageId: item.pageId,
        noteId: item.noteId,
        title: item.title,
        highlightedText: item.highlightedSnippet,
        matchType: item.matchType,
        sourceUrl: item.sourceUrl,
      }),
    );
  };

  /**
   * Stable React `key` for list items.
   * リスト項目用の安定した React `key`。
   */
  const resultKey = (item: SearchResultItem): string => {
    // Issue #889 Phase 3 以降は全ページが note id を持つので統一キーで足りる。
    // Every page row carries a note id since Issue #889 Phase 3.
    return `page-${item.noteId}-${item.pageId}`;
  };

  return (
    <div className="min-h-0 flex-1 py-6">
      <Container>
        <div className="mb-6">
          {searchQuery ? (
            <h1 className="text-lg font-medium">
              {t("common.search.resultsHeading", { query: searchQuery })}
              {!isLoading && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {t("common.search.resultsCount", { count: results.length })}
                </span>
              )}
            </h1>
          ) : (
            <h1 className="text-muted-foreground text-lg font-medium">
              {t("common.search.promptHeading")}
            </h1>
          )}
        </div>

        {isLoading && searchQuery.length >= 3 && <SearchResultsLoadingSkeleton />}

        {searchQuery.length > 0 && searchQuery.length < 3 && (
          <SearchResultsEmptyState description={t("common.search.minChars")} />
        )}

        {!isLoading && searchQuery.length >= 3 && results.length === 0 && (
          <SearchResultsEmptyState
            title={t("common.search.emptyTitle")}
            description={t("common.search.emptyDescription")}
          />
        )}

        {!isLoading && results.length > 0 && (
          <div className="max-w-3xl space-y-3">
            {results.map((item) => (
              <SearchResultCard
                key={resultKey(item)}
                item={item}
                onClick={() => handleResultClick(item)}
              />
            ))}
          </div>
        )}

        {!searchQuery && <SearchResultsEmptyState description={t("common.search.initialHint")} />}
      </Container>
    </div>
  );
}
