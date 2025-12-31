import React from "react";
import { Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceUrlBadgeProps {
  sourceUrl: string;
  className?: string;
}

/**
 * 引用元URLを表示するバッジコンポーネント
 * ページエディタの上部に表示
 */
export const SourceUrlBadge: React.FC<SourceUrlBadgeProps> = ({
  sourceUrl,
  className,
}) => {
  // URLからホスト名を抽出
  const getDisplayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const displayUrl = getDisplayUrl(sourceUrl);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-muted/50 border border-border/50",
        "text-sm text-muted-foreground",
        className
      )}
    >
      <Link2 className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">引用元:</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-primary hover:underline truncate"
      >
        <span className="truncate">{displayUrl}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
};
