import React from "react";
import { Image as ImageIcon, Wand2 } from "lucide-react";
import { Button } from "@zedi/ui";

interface EditorRecommendationBarActionsProps {
  onOpenThumbnailPicker: () => void;
  onGenerateImage: () => void;
  isLoading: boolean;
}

export const EditorRecommendationBarActions: React.FC<EditorRecommendationBarActionsProps> = ({
  onOpenThumbnailPicker,
  onGenerateImage,
  isLoading,
}) => (
  <div className="flex items-center gap-2">
    <Button type="button" size="sm" variant="outline" onClick={onOpenThumbnailPicker}>
      <ImageIcon className="mr-1 h-4 w-4" />
      画像を検索
    </Button>
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onGenerateImage}
      disabled={isLoading}
    >
      <Wand2 className="mr-1 h-4 w-4" />
      AIで生成
    </Button>
    <span className="text-xs text-muted-foreground">タイトルから画像を検索または生成します</span>
  </div>
);
