import React from "react";
import { Image as ImageIcon } from "lucide-react";

interface DragOverlayProps {
  isVisible: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center pointer-events-none z-40">
      <div className="bg-background border-2 border-dashed border-primary rounded-lg p-4 text-center">
        <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">画像をドロップしてアップロード</p>
      </div>
    </div>
  );
};
