import React from "react";
import { Image as ImageIcon } from "lucide-react";

interface DragOverlayProps {
  isVisible: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-primary/10">
      <div className="rounded-lg border-2 border-dashed border-primary bg-background p-4 text-center">
        <ImageIcon className="mx-auto mb-2 h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">画像をドロップしてアップロード</p>
      </div>
    </div>
  );
};
