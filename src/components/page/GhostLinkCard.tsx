import { Card, CardHeader, CardTitle, CardContent } from "@zedi/ui";
import { FilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GhostLinkCardProps {
  title: string;
  onClick: () => void;
}

/**
 *
 */
export function GhostLinkCard({ title, onClick }: GhostLinkCardProps) {
  const { t } = useTranslation();
  return (
    <Card
      className="hover:bg-accent flex aspect-square cursor-pointer flex-col border-dashed transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <FilePlus className="h-3 w-3 shrink-0" />
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end p-3 pt-0">
        <p className="text-muted-foreground text-xs">{t("common.page.ghostCreateHint")}</p>
      </CardContent>
    </Card>
  );
}
