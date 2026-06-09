import { FileText, Link as LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  if (page && exists) {
    const preview = page.contentPreview || getContentPreview(page.content, 100);
    const existingBody = (
      <>
        <span className="flex items-center gap-2">
          {page.sourceUrl ? (
            <LinkIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate text-sm font-medium">
            {page.title || t("common.untitledPage")}
          </span>
        </span>
        {preview && (
          <span className="text-muted-foreground mt-1.5 line-clamp-3 block text-xs">{preview}</span>
        )}
        <span className="text-muted-foreground mt-2 block text-[11px]">
          {formatTimeAgo(page.updatedAt)}
        </span>
      </>
    );
    if (onClick) {
      return (
        <button type="button" className="w-full text-left" onClick={onClick}>
          {existingBody}
        </button>
      );
    }
    return <div className="w-full text-left">{existingBody}</div>;
  }

  const ghostBody = (
    <>
      <span className="flex items-center gap-2">
        <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        <span className="text-muted-foreground truncate text-sm font-medium">{title}</span>
      </span>
      <span className="text-muted-foreground mt-1.5 block text-xs">
        {referenced ? t("common.wikiLink.notCreatedWithRefs") : t("common.wikiLink.notCreated")}
      </span>
      {onClick ? (
        <span className="text-primary mt-2 block text-xs">
          {t("common.wikiLink.clickToCreate")}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="w-full text-left" onClick={onClick}>
        {ghostBody}
      </button>
    );
  }

  return <div className="w-full text-left">{ghostBody}</div>;
}
