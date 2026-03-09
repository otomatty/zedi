import React from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";

interface EditorRecommendationBarGeneratingProps {
  isLoading: boolean;
  errorMessage: string | null;
  onBackToActions: () => void;
}

export const EditorRecommendationBarGenerating: React.FC<
  EditorRecommendationBarGeneratingProps
> = ({ isLoading, errorMessage, onBackToActions }) => (
  <div className="space-y-2">
    {isLoading && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        画像を生成中...
      </div>
    )}
    {errorMessage && <div className="text-xs text-destructive">{errorMessage}</div>}
    {!isLoading && !errorMessage && (
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onBackToActions}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          戻る
        </Button>
      </div>
    )}
  </div>
);
