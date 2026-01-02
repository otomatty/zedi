import React from "react";
import {
  AlertTriangle,
  ExternalLink,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Container from "@/components/layout/Container";
import type { Page } from "@/types/page";
import type { ContentError } from "../TiptapEditor/useContentSanitizer";

interface PageEditorAlertsProps {
  // Title validation
  duplicatePage: Page | null;
  errorMessage: string | null;
  isTitleEmpty: boolean;
  title: string;
  isNewPage: boolean;
  onOpenDuplicatePage: () => void;
  
  // Wiki generating
  isWikiGenerating: boolean;
  onCancelWiki: () => void;
  
  // Content error
  contentError: ContentError | null;
}

/**
 * Alert banners for PageEditor
 * Shows warnings for duplicate titles, empty titles, wiki generation status, and content errors
 */
export const PageEditorAlerts: React.FC<PageEditorAlertsProps> = ({
  duplicatePage,
  errorMessage,
  isTitleEmpty,
  title,
  isNewPage,
  onOpenDuplicatePage,
  isWikiGenerating,
  onCancelWiki,
  contentError,
}) => {
  const showTitleAlerts = duplicatePage || (!isNewPage && isTitleEmpty && title === "");

  return (
    <>
      {/* タイトル警告エリア */}
      {showTitleAlerts && (
        <div className="border-b border-border bg-destructive/10">
          <Container>
            {/* タイトル重複警告 */}
            {duplicatePage && (
              <Alert
                variant="destructive"
                className="border-0 bg-transparent py-3"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span className="text-sm">{errorMessage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenDuplicatePage}
                    className="shrink-0"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    開く
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {/* 既存ページで空タイトル警告 */}
            {!isNewPage && isTitleEmpty && title === "" && !duplicatePage && (
              <Alert
                variant="destructive"
                className="border-0 bg-transparent py-3"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  タイトルを入力してください
                </AlertDescription>
              </Alert>
            )}
          </Container>
        </div>
      )}

      {/* Wiki生成中バナー */}
      {isWikiGenerating && (
        <div className="border-b border-border bg-primary/5">
          <Container>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">
                  「{title}」について解説を生成しています...
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onCancelWiki}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                キャンセル
              </Button>
            </div>
          </Container>
        </div>
      )}

      {/* コンテンツエラー警告 */}
      {contentError && (
        <div className="border-b border-border bg-amber-500/10">
          <Container>
            <Alert className="border-0 bg-transparent py-3">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-amber-800">
                    {contentError.message}
                  </span>
                  {contentError.removedNodeTypes.length > 0 && (
                    <span className="text-xs text-amber-700">
                      削除されたノード: {contentError.removedNodeTypes.join(", ")}
                    </span>
                  )}
                  {contentError.removedMarkTypes.length > 0 && (
                    <span className="text-xs text-amber-700">
                      削除されたマーク: {contentError.removedMarkTypes.join(", ")}
                    </span>
                  )}
                  {contentError.wasSanitized && (
                    <span className="text-xs text-amber-600 mt-1">
                      ※ コンテンツは自動的に修正されました。保存すると修正後のデータが保存されます。
                    </span>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </Container>
        </div>
      )}
    </>
  );
};
