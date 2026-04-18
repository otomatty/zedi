import { useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Container from "@/components/layout/Container";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type { SearchResultCardItem } from "@/components/search/SearchResultCard";
import { SearchResultsLoadingSkeleton } from "@/components/search/SearchResultsLoadingSkeleton";
import { SearchResultsEmptyState } from "@/components/search/SearchResultsEmptyState";
import { useSearchPages, useSearchSharedNotes } from "@/hooks/usePageQueries";
import { extractPlainText } from "@/lib/contentUtils";
import {
  type MatchType,
  parseSearchQuery,
  determineMatchType,
  extractSmartSnippet,
  highlightKeywords,
  calculateEnhancedScore,
} from "@/lib/searchUtils";
import { useGlobalSearchContext } from "@/contexts/GlobalSearchContext";

interface SearchResultItem extends SearchResultCardItem {
  snippet: string;
  score: number;
}

/**
 * Renders global search results for the `q` query string (personal pages and shared notes).
 *
 * クエリ `q` に対するグローバル検索結果（個人ページと共有ノート）を表示する。
 */
export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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

    const personal: SearchResultItem[] = personalResults
      .filter((page) => !page.isDeleted)
      .map((page) => {
        const content = extractPlainText(page.content);
        const matchType = determineMatchType(page.title, content, keywords, searchQuery);
        const score = calculateEnhancedScore(page, keywords, matchType);
        const snippet = extractSmartSnippet(content, keywords, 200);
        const highlightedSnippet = highlightKeywords(snippet, keywords);
        return {
          pageId: page.id,
          title: page.title || "無題のページ",
          snippet,
          highlightedSnippet,
          matchType,
          sourceUrl: page.sourceUrl,
          thumbnailUrl: page.thumbnailUrl,
          updatedAt: page.updatedAt,
          score,
        };
      });

    const shared: SearchResultItem[] = sharedResults.map((r) => {
      const preview = r.content_preview ?? "";
      const snippet = extractSmartSnippet(preview, keywords, 200);
      const highlightedSnippet = highlightKeywords(snippet || "（共有ノート）", keywords);
      return {
        pageId: r.id,
        noteId: r.note_id,
        title: r.title ?? "無題のページ",
        snippet,
        highlightedSnippet,
        matchType: "content" as MatchType,
        sourceUrl: r.source_url ?? undefined,
        thumbnailUrl: r.thumbnail_url ?? undefined,
        updatedAt: new Date(r.updated_at).getTime(),
        score: 0,
      };
    });

    return [...personal, ...shared].sort((a, b) => b.score - a.score);
  }, [personalResults, sharedResults, searchQuery, keywords]);

  /**
   * Navigates to the note page or standalone page for the clicked result.
   *
   * クリックされた結果に応じてノート配下または単体ページへ遷移する。
   */
  const handleResultClick = (item: SearchResultItem) => {
    if (item.noteId) {
      navigate(`/note/${item.noteId}/page/${item.pageId}`);
    } else {
      navigate(`/page/${item.pageId}`);
    }
  };

  /**
   * Stable React `key` for list items (shared vs personal).
   *
   * リスト項目用の安定した React `key`（共有／個人の区別）。
   */
  const resultKey = (item: SearchResultItem) =>
    item.noteId ? `shared-${item.noteId}-${item.pageId}` : `personal-${item.pageId}`;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto py-6">
      <Container>
        <div className="mb-6">
          {searchQuery ? (
            <h1 className="text-lg font-medium">
              「{searchQuery}」の検索結果
              {!isLoading && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {results.length}件
                </span>
              )}
            </h1>
          ) : (
            <h1 className="text-muted-foreground text-lg font-medium">
              検索キーワードを入力してください
            </h1>
          )}
        </div>

        {isLoading && searchQuery.length >= 3 && <SearchResultsLoadingSkeleton />}

        {searchQuery.length > 0 && searchQuery.length < 3 && (
          <SearchResultsEmptyState description="3文字以上入力してください" />
        )}

        {!isLoading && searchQuery.length >= 3 && results.length === 0 && (
          <SearchResultsEmptyState
            title="検索結果が見つかりません"
            description="別のキーワードで検索してみてください"
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

        {!searchQuery && (
          <SearchResultsEmptyState description="ヘッダーの検索バーからキーワードを入力してください" />
        )}
      </Container>
    </main>
  );
}
