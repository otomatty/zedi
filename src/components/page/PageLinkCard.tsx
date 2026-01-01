import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {page.sourceUrl ? (
            <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{page.title || "無題のページ"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {page.preview || "内容がありません"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {formatTimeAgo(page.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
