import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Sparkles, X } from "lucide-react";
import { Button } from "@zedi/ui";
import type { RecommendationMode } from "./EditorRecommendationBarTypes";

interface EditorRecommendationBarHeaderProps {
  headerLabel: string;
  mode: RecommendationMode;
  nextCursor: string | null;
  isLoading: boolean;
  onNextPage: () => void;
  onBackToActions: () => void;
  onDismiss: () => void;
}

/**
 *
 */
export /**
 *
 */
const EditorRecommendationBarHeader: React.FC<EditorRecommendationBarHeaderProps> = ({
  headerLabel,
  mode,
  nextCursor,
  isLoading,
  onNextPage,
  onBackToActions,
  onDismiss,
}) => {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Sparkles className="h-4 w-4" />
        <span>{headerLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        {mode === "thumbnails" && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onNextPage}
              disabled={!nextCursor || isLoading}
            >
              {t("editor.recommendation.next")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onBackToActions}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("editor.recommendation.back")}
            </Button>
          </>
        )}
        {(mode === "actions" || mode === "thumbnails") && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            aria-label={t("editor.recommendation.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
