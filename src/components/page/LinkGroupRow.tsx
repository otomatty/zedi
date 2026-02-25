import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link2 } from "lucide-react";
import { PageLinkCard } from "./PageLinkCard";
import type { OutgoingLinkWithChildren } from "@/hooks/useLinkedPages";

interface LinkGroupRowProps {
  linkGroup: OutgoingLinkWithChildren;
  onPageClick: (pageId: string) => void;
}

export function LinkGroupRow({ linkGroup, onPageClick }: LinkGroupRowProps) {
  return (
    <div className="space-y-3">
      {/* Grid with source card and child pages */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {/* Source link card (distinguished style) */}
        <Card
          className="flex aspect-square cursor-pointer flex-col border-primary/20 bg-primary/5 transition-colors hover:bg-accent"
          onClick={() => onPageClick(linkGroup.source.id)}
        >
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{linkGroup.source.title || "無題のページ"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between p-3 pt-0">
            <p className="line-clamp-3 text-xs text-muted-foreground">
              {linkGroup.source.preview || "内容がありません"}
            </p>
            <p className="mt-auto text-xs text-primary">{linkGroup.children.length}件のリンク先</p>
          </CardContent>
        </Card>

        {/* Child pages */}
        {linkGroup.children.map((child) => (
          <PageLinkCard key={child.id} page={child} onClick={() => onPageClick(child.id)} />
        ))}
      </div>
    </div>
  );
}
