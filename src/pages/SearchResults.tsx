import { useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, FileText, Link as LinkIcon } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { HighlightedSnippet } from "@/components/search/HighlightedSnippet";
import { MatchTypeBadge } from "@/components/search/MatchTypeBadge";
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
import { cn } from "@/lib/utils";

interface SearchResultItem {
  pageId: string;
  noteId?: string;
  title: string;
  snippet: string;
  highlightedSnippet: string;
  matchType: MatchType;
  sourceUrl?: string;
  thumbnailUrl?: string;
  updatedAt: number;
  score: number;
}

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setQuery } = useGlobalSearchContext();
  const searchQuery = (searchParams.get("q") ?? "").trim();

  // ヘッダー検索バーの入力欄と同期
  useEffect(() => {
    if (searchQuery) {
      setQuery(searchQuery);
    }
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

  const handleResultClick = (item: SearchResultItem) => {
    if (item.noteId) {
      navigate(`/note/${item.noteId}/page/${item.pageId}`);
    } else {
      navigate(`/page/${item.pageId}`);
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-6">
        <Container>
          {/* 見出し */}
          <div className="mb-6">
            {searchQuery ? (
              <h1 className="text-lg font-medium">
                「{searchQuery}」の検索結果
                {!isLoading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {results.length}件
                  </span>
                )}
              </h1>
            ) : (
              <h1 className="text-lg font-medium text-muted-foreground">
                検索キーワードを入力してください
              </h1>
            )}
          </div>

          {/* ローディング */}
          {isLoading && searchQuery.length >= 3 && (
            <div className="space-y-4 max-w-3xl">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-4 rounded-lg border border-border p-4">
                  <div className="h-16 w-24 bg-muted rounded shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-1/3 bg-muted rounded" />
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-2/3 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 検索クエリが短すぎる */}
          {searchQuery.length > 0 && searchQuery.length < 3 && (
            <div className="py-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">3文字以上入力してください</p>
            </div>
          )}

          {/* 結果なし */}
          {!isLoading && searchQuery.length >= 3 && results.length === 0 && (
            <div className="py-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium mb-1">検索結果が見つかりません</p>
              <p className="text-sm text-muted-foreground">
                別のキーワードで検索してみてください
              </p>
            </div>
          )}

          {/* 検索結果リスト */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-3 max-w-3xl">
              {results.map((item) => (
                <button
                  key={item.noteId ? `shared-${item.noteId}-${item.pageId}` : `personal-${item.pageId}`}
                  type="button"
                  onClick={() => handleResultClick(item)}
                  className={cn(
                    "w-full text-left rounded-lg border border-border p-4",
                    "hover:bg-muted/50 hover:border-muted-foreground/30 transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                >
                  <div className="flex gap-4">
                    {/* サムネイル */}
                    {item.thumbnailUrl && (
                      <div className="shrink-0">
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          className="h-20 w-28 rounded object-cover bg-muted"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* タイトル行 */}
                      <div className="flex items-center gap-2 mb-1.5">
                        {item.sourceUrl ? (
                          <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <h3 className="font-medium text-base truncate flex-1">
                          {item.title}
                        </h3>
                        <MatchTypeBadge type={item.matchType} />
                        {item.noteId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 shrink-0">
                            共有
                          </span>
                        )}
                      </div>

                      {/* ハイライト付きスニペット */}
                      <div className="mb-1.5">
                        <HighlightedSnippet text={item.highlightedSnippet} />
                      </div>

                      {/* メタ情報 */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatDate(item.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 初期状態（クエリ未入力） */}
          {!searchQuery && (
            <div className="py-12 text-center">
              <Search className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">
                ヘッダーの検索バーからキーワードを入力してください
              </p>
            </div>
          )}
        </Container>
      </main>
    </div>
  );
}
