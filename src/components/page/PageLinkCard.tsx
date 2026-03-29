import { Card, CardHeader, CardTitle, CardContent } from "@zedi/ui";
import { FileText, Link as LinkIcon } from "lucide-react";
import { formatTimeAgo } from "@/lib/dateUtils";
import type { PageCard } from "@/hooks/useLinkedPages";

interface PageLinkCardProps {
  page: PageCard;
  onClick: () => void;
}

/**
 *
 */
export function PageLinkCard({ page, onClick }: PageLinkCardProps) {
  return (
    <Card
      className="hover:bg-accent flex aspect-square cursor-pointer flex-col transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {page.sourceUrl ? (
            <LinkIcon className="text-muted-foreground h-3 w-3 shrink-0" />
          ) : (
            <FileText className="text-muted-foreground h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{page.title || "無題のページ"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between p-3 pt-0">
        <p className="text-muted-foreground line-clamp-3 text-xs">
          {page.preview || "内容がありません"}
        </p>
        <p className="text-muted-foreground mt-auto text-xs">{formatTimeAgo(page.updatedAt)}</p>
      </CardContent>
    </Card>
  );
}
