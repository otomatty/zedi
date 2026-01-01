import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FilePlus } from "lucide-react";

interface GhostLinkCardProps {
  title: string;
  onClick: () => void;
}

export function GhostLinkCard({ title, onClick }: GhostLinkCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors border-dashed aspect-square flex flex-col"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <FilePlus className="h-3 w-3 shrink-0" />
          <span className="truncate">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 flex flex-col justify-end">
        <p className="text-xs text-muted-foreground">
          クリックしてページを作成
        </p>
      </CardContent>
    </Card>
  );
}
