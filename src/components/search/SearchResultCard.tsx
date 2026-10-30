import { FileText, Link as LinkIcon } from "lucide-react";
import { HighlightedSnippet } from "@/components/search/HighlightedSnippet";
import { MatchTypeBadge } from "@/components/search/MatchTypeBadge";
import type { MatchType } from "@/lib/searchUtils";
import { cn } from "@zedi/ui";
import { useAuthenticatedImageUrl } from "@/hooks/media/useAuthenticatedImageUrl";

/** 検索結果カードの表示用アイテム。 / Display item for a search result card. */
export type SearchResultCardItem = SearchResultCardPageItem;

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
  /**
   * 所属ノート ID。`/notes/:noteId/:pageId` 遷移用（Issue #889 Phase 3）。
   * Issue #1020 以降は常に非 null。
   * Owning note id used for `/notes/:noteId/:pageId` routing (Issue #889
   * Phase 3). Always non-null since issue #1020.
   */
  noteId: string;
  /**
   * 共有検索（参加ノート横断の API 検索）由来の行か。「共有」バッジの表示に使う。
   * `noteId` の有無では判定できない（Issue #1020 で全ページが noteId を持つため）。
   * Whether the row came from the shared (cross-note API) search; drives the
   * "共有" badge. Cannot be derived from `noteId` anymore — every page carries
   * one since issue #1020.
   */
  isShared: boolean;
  sourceUrl?: string;
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

  const isShared = item.isShared;
  const hasSourceUrl = Boolean(item.sourceUrl);

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
            {hasSourceUrl ? (
              <LinkIcon className="text-muted-foreground h-4 w-4 shrink-0" />
            ) : (
              <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate text-base font-medium">{item.title}</span>
            <MatchTypeBadge type={item.matchType} />
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
