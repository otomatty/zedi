import React from "react";
import { Button } from "@/components/ui/button";
import { GitBranch, Image as ImageIcon } from "lucide-react";

interface EditorSelectionMenuProps {
  show: boolean;
  position: { top: number; left: number } | null;
  onOpenMermaidDialog: () => void;
  onInsertImage: () => void;
  isReadOnly: boolean;
}

export const EditorSelectionMenu: React.FC<EditorSelectionMenuProps> = ({
  show,
  position,
  onOpenMermaidDialog,
  onInsertImage,
  isReadOnly,
}) => {
  if (!show || !position) return null;

  return (
    <div
      className="absolute z-50 flex items-center gap-1 bg-background border rounded-lg shadow-lg p-1"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <Button size="sm" variant="ghost" onClick={onOpenMermaidDialog} className="text-xs">
        <GitBranch className="h-4 w-4 mr-1" />
        ダイアグラム生成
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onInsertImage}
        className="text-xs"
        disabled={isReadOnly}
      >
        <ImageIcon className="h-4 w-4 mr-1" />
        画像を挿入
      </Button>
    </div>
  );
};
