import { Card, CardHeader, CardTitle, CardContent } from "@zedi/ui";
import { FileText, Link as LinkIcon } from "lucide-react";
import { formatTimeAgo } from "@/lib/dateUtils";
import type { PageCard } from "@/hooks/useLinkedPages";

interface PageLinkCardProps {
  page: PageCard;
  onClick: () => void;
}

export function PageLinkCard({ page, onClick }: PageLinkCardProps) {
  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {page.sourceUrl ? (
            <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{page.title || "無題のページ"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between p-3 pt-0">
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {page.preview || "内容がありません"}
        </p>
        <p className="mt-auto text-xs text-muted-foreground">{formatTimeAgo(page.updatedAt)}</p>
      </CardContent>
    </Card>
  );
}
