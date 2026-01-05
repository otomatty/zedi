import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {/* Source link card (distinguished style) */}
        <Card
          className="cursor-pointer hover:bg-accent transition-colors bg-primary/5 border-primary/20 aspect-square flex flex-col"
          onClick={() => onPageClick(linkGroup.source.id)}
        >
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">
                {linkGroup.source.title || "無題のページ"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 flex-1 flex flex-col justify-between">
            <p className="text-xs text-muted-foreground line-clamp-3">
              {linkGroup.source.preview || "内容がありません"}
            </p>
            <p className="text-xs text-primary mt-auto">
              {linkGroup.children.length}件のリンク先
            </p>
          </CardContent>
        </Card>

        {/* Child pages */}
        {linkGroup.children.map((child) => (
          <PageLinkCard
            key={child.id}
            page={child}
            onClick={() => onPageClick(child.id)}
          />
        ))}
      </div>
    </div>
  );
}
