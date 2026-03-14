import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@zedi/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@zedi/ui";
import { Alert, AlertDescription } from "@zedi/ui";
import { useWebClipper, type WebClipperStatus } from "@/hooks/useWebClipper";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import { commitThumbnailFromUrl, AuthRedirectError } from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import { useToast } from "@zedi/ui";
import { useWebClipperDialogState } from "./useWebClipperDialogState";
import { WebClipperDialogPreview } from "./WebClipperDialogPreview";
import { WebClipperDialogFooter } from "./WebClipperDialogFooter";

function isAuthRedirectError(err: unknown): err is AuthRedirectError {
  return err instanceof AuthRedirectError;
}

interface WebClipperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClipped: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null,
  ) => void;
}

/**
 * Web ページクリッピングダイアログ。URL を入力して Web ページのコンテンツを取り込む。
 * Web page clipping dialog. Enter a URL to import content from a web page.
 */
export const WebClipperDialog: React.FC<WebClipperDialogProps> = ({
  open,
  onOpenChange,
  onClipped,
}) => {
  const { t } = useTranslation();
  const statusMessages: Record<WebClipperStatus, string> = useMemo(
    () => ({
      idle: "",
      fetching: t("editor.webClipper.statusFetching"),
      extracting: t("editor.webClipper.statusExtracting"),
      completed: t("editor.webClipper.statusCompleted"),
      error: "",
    }),
    [t],
  );
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient({ getToken }), [getToken]);
  const { status, clippedContent, error, clip, reset, getTiptapContent } = useWebClipper({ api });
  const { url, setUrl, handlePaste, resetDialogState, isCurrentUrlClipped } =
    useWebClipperDialogState({ clip, reset });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const submitGenerationRef = useRef(0);
  const { toast } = useToast();

  const hasFreshContent = Boolean(clippedContent) && isCurrentUrlClipped();

  useEffect(() => {
    if (!open) {
      submitGenerationRef.current += 1;
      resetDialogState();
    }
  }, [open, resetDialogState]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        submitGenerationRef.current += 1;
        // resetDialogState は useEffect（open の変化監視）で一括実行する。
        // resetDialogState is executed centrally in the useEffect that watches open.
        // ここで呼ぶと、親が open=false を渡したときに effect と二重実行になる。
        // Calling it here would double-execute when the parent passes open=false.
        // submitGenerationRef のみここで進めて、in-flight handleClip の即時 bail-out を保証する。
        // Only advance submitGenerationRef here to guarantee immediate bail-out of in-flight handleClip.
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleClip = useCallback(async () => {
    if (!clippedContent || !hasFreshContent || isSubmittingRef.current) return;

    const submitGeneration = submitGenerationRef.current;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    let committedThumbnail: string | undefined;
    let committedProvider: string | undefined;
    let commitAttemptedAndFailed = false;
    try {
      if (clippedContent.thumbnailUrl) {
        try {
          const baseUrl = getThumbnailApiBaseUrl();
          if (!baseUrl) {
            commitAttemptedAndFailed = true;
          } else {
            const result = await commitThumbnailFromUrl(clippedContent.thumbnailUrl, {
              baseUrl,
              title: clippedContent.title,
            });
            committedThumbnail = result.imageUrl;
            committedProvider = result.provider;
          }
        } catch (err) {
          if (submitGeneration !== submitGenerationRef.current) return;
          if (isAuthRedirectError(err)) {
            toast({
              title: t("editor.webClipper.loginRequired"),
              description: t("editor.webClipper.loginRequiredDescription"),
              variant: "destructive",
            });
            commitAttemptedAndFailed = true;
          } else {
            console.error("Failed to commit thumbnail:", err);
            toast({
              title: t("editor.webClipper.thumbnailSaveFailed"),
              description: t("editor.webClipper.thumbnailSaveFailedDescription"),
              variant: "destructive",
            });
            commitAttemptedAndFailed = true;
          }
        }
      }
      let thumbnailForContent = clippedContent.thumbnailUrl;
      if (committedThumbnail) {
        thumbnailForContent = committedThumbnail;
      } else if (commitAttemptedAndFailed) {
        thumbnailForContent = null;
      }
      if (submitGeneration !== submitGenerationRef.current) return;
      const tiptapContent = getTiptapContent(thumbnailForContent, committedProvider);
      if (tiptapContent) {
        onClipped(
          clippedContent.title,
          tiptapContent,
          clippedContent.sourceUrl,
          committedThumbnail ?? undefined,
        );
        handleDialogOpenChange(false);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [
    clippedContent,
    hasFreshContent,
    getTiptapContent,
    onClipped,
    handleDialogOpenChange,
    toast,
    t,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && hasFreshContent && !isSubmitting) {
        e.preventDefault();
        handleClip();
      }
    },
    [hasFreshContent, isSubmitting, handleClip],
  );

  const isProcessing = status === "fetching" || status === "extracting";
  const isBusy = isProcessing || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("editor.webClipper.title")}
          </DialogTitle>
          <DialogDescription>{t("editor.webClipper.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              placeholder={t("editor.webClipper.placeholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              className="font-mono text-sm"
              autoFocus
            />
          </div>

          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusMessages[status]}
            </div>
          )}

          {status === "completed" && hasFreshContent && clippedContent && (
            <WebClipperDialogPreview clippedContent={clippedContent} />
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">{t("editor.webClipper.tip")}</p>
        </div>

        <WebClipperDialogFooter
          isBusy={isBusy}
          hasContent={hasFreshContent}
          onCancel={() => handleDialogOpenChange(false)}
          onSubmit={handleClip}
        />
      </DialogContent>
    </Dialog>
  );
};
