/**
 * Web Clipper ダイアログの submit・開閉・initialUrl 反映ロジックを集約する hook。
 * Encapsulates submit, open/close, and initialUrl prefill logic for the Web Clipper dialog.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { commitThumbnailFromUrl, AuthRedirectError } from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import type { ClippedContent } from "@/lib/webClipper";

function isAuthRedirectError(err: unknown): err is AuthRedirectError {
  return err instanceof AuthRedirectError;
}

/**
 *
 */
export interface UseWebClipperDialogSubmitOptions {
  open: boolean;
  initialUrl?: string;
  onOpenChange: (open: boolean) => void;
  onClipped: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null,
  ) => void;
  setUrl: (url: string) => void;
  resetDialogState: () => void;
  clippedContent: ClippedContent | null;
  hasFreshContent: boolean;
  getTiptapContent: (
    thumbnailUrl?: string | null,
    storageProviderId?: string | null,
  ) => string | null;
  status: string;
}

/**
 *
 */
export interface UseWebClipperDialogSubmitReturn {
  handleDialogOpenChange: (nextOpen: boolean) => void;
  handleClip: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  isSubmitting: boolean;
  isBusy: boolean;
}

/**
 * Web Clipper ダイアログの確定処理・サムネイル commit・開閉制御を行う。
 * Performs clip submit, thumbnail commit, and dialog open/close control.
 */
export function useWebClipperDialogSubmit(
  options: UseWebClipperDialogSubmitOptions,
): UseWebClipperDialogSubmitReturn {
  const {
    open,
    initialUrl,
    onOpenChange,
    onClipped,
    setUrl,
    resetDialogState,
    clippedContent,
    hasFreshContent,
    getTiptapContent,
    status,
  } = options;

  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const submitGenerationRef = useRef(0);
  const appliedInitialUrlRef = useRef(false);

  useEffect(() => {
    if (!open) {
      appliedInitialUrlRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (open && initialUrl?.trim() && !appliedInitialUrlRef.current) {
      appliedInitialUrlRef.current = true;
      setUrl(initialUrl.trim());
    }
  }, [open, initialUrl, setUrl]);

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

  return {
    handleDialogOpenChange,
    handleClip,
    handleKeyDown,
    isSubmitting,
    isBusy,
  };
}
