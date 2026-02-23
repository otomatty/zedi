import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FilePlus } from "lucide-react";

interface GhostLinkCardProps {
  title: string;
  onClick: () => void;
}

export function GhostLinkCard({ title, onClick }: GhostLinkCardProps) {
  return (
    <Card
      className="flex aspect-square cursor-pointer flex-col border-dashed transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FilePlus className="h-3 w-3 shrink-0" />
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end p-3 pt-0">
        <p className="text-xs text-muted-foreground">クリックしてページを作成</p>
      </CardContent>
    </Card>
  );
}
