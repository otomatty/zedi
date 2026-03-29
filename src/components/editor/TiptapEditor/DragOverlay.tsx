import React from "react";
import { Image as ImageIcon } from "lucide-react";

interface DragOverlayProps {
  isVisible: boolean;
}

/**
 *
 */
export /**
 *
 */
const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="bg-primary/10 pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <div className="border-primary bg-background rounded-lg border-2 border-dashed p-4 text-center">
        <ImageIcon className="text-primary mx-auto mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">画像をドロップしてアップロード</p>
      </div>
    </div>
  );
};
