import { Card, CardHeader, CardTitle, CardContent } from "@zedi/ui";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageLinkCard } from "./PageLinkCard";
import type { OutgoingLinkWithChildren } from "@/hooks/useLinkedPages";

interface LinkGroupRowProps {
  linkGroup: OutgoingLinkWithChildren;
  onPageClick: (pageId: string) => void;
}

/**
 *
 */
export function LinkGroupRow({ linkGroup, onPageClick }: LinkGroupRowProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {/* Grid with source card and child pages */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {/* Source link card (distinguished style) */}
        <Card
          className="border-primary/20 bg-primary/5 hover:bg-accent flex aspect-square cursor-pointer flex-col transition-colors"
          onClick={() => onPageClick(linkGroup.source.id)}
        >
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="text-primary h-3 w-3 shrink-0" />
              <span className="truncate">{linkGroup.source.title || t("common.untitledPage")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between p-3 pt-0">
            <p className="text-muted-foreground line-clamp-3 text-xs">
              {linkGroup.source.preview || t("common.page.noPreview")}
            </p>
            <p className="text-primary mt-auto text-xs">
              {t("common.page.linkTargets", { count: linkGroup.children.length })}
            </p>
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
