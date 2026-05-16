import { FileText, Link as LinkIcon, BookOpen } from "lucide-react";
import { HighlightedSnippet } from "@/components/search/HighlightedSnippet";
import { MatchTypeBadge } from "@/components/search/MatchTypeBadge";
import type { MatchType } from "@/lib/searchUtils";
import { cn } from "@zedi/ui";
import { useAuthenticatedImageUrl } from "@/hooks/useAuthenticatedImageUrl";

/**
 * 検索結果カードの表示用アイテム。判別可能 union で `kind` が `"page"` と
 * `"pdf_highlight"` の 2 種を持つ。`kind="page"` は `pageId` が必須、
 * `kind="pdf_highlight"` は `sourceId` / `highlightId` / `pdfPage` を持つ。
 *
 * Discriminated union: `kind="page"` rows must carry `pageId`; PDF highlight
 * rows carry `sourceId`/`highlightId`/`pdfPage` so the click handler can route
 * to the derived page or the PDF viewer (Issue #864).
 */
export type SearchResultCardItem = SearchResultCardPageItem | SearchResultCardPdfHighlightItem;

interface SearchResultCardBase {
  title: string;
  highlightedSnippet: string;
  matchType: MatchType;
  thumbnailUrl?: string;
  updatedAt: number;
}

/**
 * ページ系（個人 / 共有ノート）検索結果用のカード項目。
 *
 * Card item for a page-kind search result (personal page or shared note page).
 *
 * @property pageId - 対象ページ ID。Target page id.
 * @property noteId - 共有ノート所属ページの場合に設定されるノート ID。
 *   Owning note id when the page is note-native (used for /notes/:noteId/:pageId routing).
 * @property sourceUrl - クリップ系ページに紐づく出典 URL。Source URL for clipped pages.
 */
export interface SearchResultCardPageItem extends SearchResultCardBase {
  kind: "page";
  pageId: string;
  noteId?: string;
  sourceUrl?: string;
}

/**
 * Issue #864: PDF ハイライト本文ヒット用のカード項目。
 * クリック時は派生 Zedi ページがあればそちらへ、なければ PDF ビューアへ deep-link。
 *
 * Issue #864: card item for a `pdf_highlights.text` match. Clicking routes to
 * the derived Zedi page when one exists, otherwise deep-links to the PDF
 * viewer at `/sources/:sourceId/pdf#page=N`.
 *
 * @property highlightId - ハイライトの一意 ID。Highlight UUID.
 * @property sourceId - 元 PDF ソース ID。Owning PDF source id (`sources.id`).
 * @property pdfPage - 1 始まりの PDF ページ番号。1-indexed PDF page number.
 * @property derivedPageId - 派生 Zedi ページがあれば ID、なければ null。
 *   Derived Zedi page id when one exists, otherwise null.
 */
export interface SearchResultCardPdfHighlightItem extends SearchResultCardBase {
  kind: "pdf_highlight";
  highlightId: string;
  sourceId: string;
  pdfPage: number;
  derivedPageId: string | null;
}

function formatDate(ts: number): string {
  if (ts <= 0 || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface SearchResultCardProps {
  item: SearchResultCardItem;
  onClick: () => void;
}

/**
 *
 */
export function SearchResultCard({ item, onClick }: SearchResultCardProps) {
  const { resolvedUrl: thumbnailSrc, hasError: thumbnailError } = useAuthenticatedImageUrl(
    item.thumbnailUrl,
  );

  const isPdf = item.kind === "pdf_highlight";
  const isShared = item.kind === "page" && Boolean(item.noteId);
  const hasSourceUrl = item.kind === "page" && Boolean(item.sourceUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border w-full rounded-lg border p-4 text-left",
        "hover:border-muted-foreground/30 hover:bg-muted/50 transition-colors",
        "focus:ring-ring focus:ring-2 focus:outline-none",
      )}
    >
      <div className="flex gap-4">
        {thumbnailSrc && !thumbnailError && (
          <div className="shrink-0">
            <img
              src={thumbnailSrc}
              alt=""
              className="bg-muted h-20 w-28 rounded object-cover"
              loading="lazy"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            {isPdf ? (
              <BookOpen className="text-muted-foreground h-4 w-4 shrink-0" />
            ) : hasSourceUrl ? (
              <LinkIcon className="text-muted-foreground h-4 w-4 shrink-0" />
            ) : (
              <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate text-base font-medium">{item.title}</span>
            <MatchTypeBadge type={item.matchType} />
            {isPdf && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                PDF
              </span>
            )}
            {isShared && (
              <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                共有
              </span>
            )}
          </div>

          <div className="mb-1.5">
            <HighlightedSnippet text={item.highlightedSnippet} />
          </div>

          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span>{formatDate(item.updatedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
