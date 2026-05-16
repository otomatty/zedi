import { useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/Container";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type {
  SearchResultCardPageItem,
  SearchResultCardPdfHighlightItem,
} from "@/components/search/SearchResultCard";
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
import { resolveSearchResultUrl, useGlobalSearchContext } from "@/contexts/GlobalSearchContext";
import {
  PDF_HIGHLIGHT_BASE_SCORE,
  dedupSharedRowsAgainstPersonal,
  formatPdfHighlightDisplay,
} from "@/hooks/useGlobalSearch";
import type { SearchPageResultRow, SearchPdfHighlightResultRow } from "@/lib/api/types";

type PageSearchResultItem = SearchResultCardPageItem & {
  snippet: string;
  score: number;
};

type PdfHighlightSearchResultItem = SearchResultCardPdfHighlightItem & {
  snippet: string;
  score: number;
};

type SearchResultItem = PageSearchResultItem | PdfHighlightSearchResultItem;

/**
 * Renders global search results for the `q` query string (personal pages and shared notes).
 *
 * クエリ `q` に対するグローバル検索結果（個人ページと共有ノート）を表示する。
 *
 * Issue #864: `kind="pdf_highlight"` 行も同じ結果リストに混ぜて表示する。クリック時の
 * 遷移先は派生 Zedi ページ（あれば）または PDF ビューアの該当ページ。
 *
 * Issue #864: highlight rows from `pdf_highlights` are merged into the same
 * results list and routed via the shared `resolveSearchResultUrl` helper.
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
    // 個人 IDB に既に出ている page id だけを shared から落とす。`note_id` が
    // null でも他ユーザー所有のリンク済み個人ページは IDB に無いので残す
    // (Codex / CodeRabbit 指摘)。
    //
    // Issue #718 Phase 5-4: dedup is centralized in
    // `dedupSharedRowsAgainstPersonal` and works by `pageId` so linked personal
    // pages owned by other note members (which IDB does not have) survive
    // (Codex / CodeRabbit review).
    const personalIds = new Set(personal.map((item) => item.pageId));
    const dedupedShared = dedupSharedRowsAgainstPersonal(sharedResults, personalIds);

    const sharedPages: PageSearchResultItem[] = dedupedShared
      .filter((r): r is SearchPageResultRow => r.kind === "page")
      .map((r) => {
        const preview = r.content_preview ?? "";
        const snippet = extractSmartSnippet(preview, keywords, 200);
        const highlightedSnippet = highlightKeywords(
          snippet || t("common.sharedNoteContext"),
          keywords,
        );
        return {
          kind: "page",
          pageId: r.id,
          noteId: r.note_id ?? undefined,
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

    // Issue #864: PDF ハイライト行はカードのプレビューに本文抜粋を、タイトルに
    // 「<ファイル名> (p.<ページ番号>)」を出す。スコアは {@link PDF_HIGHLIGHT_BASE_SCORE}
    // で「タイトル一致 > 派生ページ一致 > ハイライト本文」の序列を保つ。
    //
    // Issue #864: PDF highlight rows render with the file name + page number
    // as title and the body excerpt as snippet. They sit at
    // {@link PDF_HIGHLIGHT_BASE_SCORE} so title and content page hits outrank
    // them, preserving the priority documented in the issue.
    const sharedHighlights: PdfHighlightSearchResultItem[] = dedupedShared
      .filter((r): r is SearchPdfHighlightResultRow => r.kind === "pdf_highlight")
      .map((r) => {
        // PR #873 review (Gemini): タイトル / snippet / 表示名は `formatPdfHighlightDisplay`
        // に集約され、ヘッダードロップダウンと同じ整形ロジックを共有する。
        // 検索結果ページではカード幅が広いので snippet を 200 字に延ばす。
        //
        // Title / snippet / display name are produced by the shared
        // `formatPdfHighlightDisplay` helper so the dropdown and this page
        // stay in lockstep. The card is wider here, so we widen the snippet
        // to 200 chars.
        const display = formatPdfHighlightDisplay(r, keywords, t, 200);
        return {
          kind: "pdf_highlight",
          highlightId: r.highlight_id,
          sourceId: r.source_id,
          pdfPage: r.pdf_page,
          derivedPageId: r.derived_page_id,
          title: display.title,
          snippet: display.snippet,
          highlightedSnippet: display.highlightedText,
          matchType: "content" as MatchType,
          thumbnailUrl: undefined,
          updatedAt: new Date(r.updated_at).getTime(),
          score: PDF_HIGHLIGHT_BASE_SCORE,
        };
      });

    return [...personal, ...sharedPages, ...sharedHighlights].sort((a, b) => b.score - a.score);
  }, [personalResults, sharedResults, searchQuery, keywords, t]);

  /**
   * Navigates based on the clicked result's kind. Delegates URL composition
   * to `resolveSearchResultUrl` so deep-link behavior stays consistent with
   * the header dropdown (Issue #864).
   *
   * クリックされた結果の種別に応じて遷移する。URL 組み立てはヘッダードロップダウン
   * と共通の `resolveSearchResultUrl` に委譲する（Issue #864）。
   */
  const handleResultClick = (item: SearchResultItem) => {
    if (item.kind === "pdf_highlight") {
      navigate(
        resolveSearchResultUrl({
          kind: "pdf_highlight",
          highlightId: item.highlightId,
          sourceId: item.sourceId,
          sourceDisplayName: "",
          pdfPage: item.pdfPage,
          derivedPageId: item.derivedPageId,
          title: item.title,
          highlightedText: item.highlightedSnippet,
          matchType: item.matchType,
        }),
      );
      return;
    }
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
   * Stable React `key` for list items (shared vs personal vs PDF highlight).
   *
   * リスト項目用の安定した React `key`（共有／個人／PDF ハイライト）。
   */
  const resultKey = (item: SearchResultItem): string => {
    if (item.kind === "pdf_highlight") {
      return `pdf-${item.sourceId}-${item.highlightId}`;
    }
    return item.noteId ? `shared-${item.noteId}-${item.pageId}` : `personal-${item.pageId}`;
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
