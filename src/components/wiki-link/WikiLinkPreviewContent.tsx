import { FileText, Link as LinkIcon } from "lucide-react";
import { formatTimeAgo } from "@/lib/dateUtils";
import { getContentPreview } from "@/lib/contentUtils";
import type { Page } from "@/types/page";

/**
 * WikiLink ホバーカードに表示するプレビューコンテンツ。
 * Preview content displayed in WikiLink hover cards.
 */
export interface WikiLinkPreviewContentProps {
  /** WikiLink のタイトル / WikiLink title */
  title: string;
  /** 解決されたページ（存在しない場合は undefined） / Resolved page (undefined if not found) */
  page: Page | undefined;
  /** ページが存在するか / Whether the page exists */
  exists: boolean;
  /** 他のページから参照されているか / Referenced from other pages */
  referenced: boolean;
  /** カードクリック時のコールバック / Callback when the card is clicked */
  onClick?: () => void;
}

/**
 * WikiLink ホバーカードの共有コンテンツコンポーネント。
 * Shared content component for WikiLink hover card preview.
 */
export function WikiLinkPreviewContent({
  title,
  page,
  exists,
  referenced,
  onClick,
}: WikiLinkPreviewContentProps) {
  if (page && exists) {
    const preview = page.contentPreview || getContentPreview(page.content, 100);
    return (
      <button type="button" className="w-full text-left" onClick={onClick}>
        <div className="flex items-center gap-2">
          {page.sourceUrl ? (
            <LinkIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate text-sm font-medium">{page.title || "無題のページ"}</span>
        </div>
        {preview && <p className="text-muted-foreground mt-1.5 line-clamp-3 text-xs">{preview}</p>}
        <p className="text-muted-foreground mt-2 text-[11px]">{formatTimeAgo(page.updatedAt)}</p>
      </button>
    );
  }

  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <div className="flex items-center gap-2">
        <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="text-muted-foreground truncate text-sm font-medium">{title}</span>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {referenced
          ? "まだ作成されていないページです。他のページからも参照されています。"
          : "まだ作成されていないページです。"}
      </p>
      <p className="text-primary mt-2 text-xs">クリックして作成</p>
    </button>
  );
}
