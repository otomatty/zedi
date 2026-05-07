/**
 * Web Clipper ダイアログの submit・開閉・initialUrl 反映ロジックを集約する hook。
 * Encapsulates submit, open/close, and initialUrl prefill logic for the Web Clipper dialog.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ToastAction, useToast } from "@zedi/ui";
import {
  commitThumbnailFromUrl,
  AuthRedirectError,
  QuotaExceededError,
} from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import type { ClippedContent } from "@/lib/webClipper";

function isAuthRedirectError(err: unknown): err is AuthRedirectError {
  return err instanceof AuthRedirectError;
}

function isQuotaExceededError(err: unknown): err is QuotaExceededError {
  return err instanceof QuotaExceededError;
}

/**
 * Web Clipper ダイアログの送信フック (`useWebClipperDialogSubmit`) のオプション。
 * 各メンバーの意味は下記コメントの通り：`onClipped` は Promise を返してよく、
 * フックは解決を await してからダイアログを閉じる（失敗時は開いたままにして
 * ユーザーにリトライを許す）。
 *
 * Options for the Web Clipper dialog submit hook. `onClipped` may return a
 * promise — the hook awaits it before closing the dialog so a rejected
 * promise (e.g. a transient page-create failure) keeps the dialog open and
 * lets the user retry.
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
    thumbnailObjectId?: string | null,
  ) => Promise<void> | void;
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
 * Web Clipper 送信フック (`useWebClipperDialogSubmit`) の戻り値。
 * `isBusy` は「クリップ抽出中（fetching/extracting）」と「送信中（submitting）」
 * を合算した busy フラグで、ダイアログのボタンや入力の disabled 制御に使う。
 *
 * Return shape of the Web Clipper dialog submit hook. `isBusy` is the union of
 * "clip extracting" and "submitting" so callers can disable inputs/buttons
 * with a single flag.
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
  const navigate = useNavigate();
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
    let committedObjectId: string | undefined;
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
            committedObjectId = result.objectId;
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
          } else if (isQuotaExceededError(err)) {
            // 容量超過時はアップグレード誘導 UI を出し、ページ作成自体は中止する。
            // 失敗しているのにテキストだけ取り込むと「サムネイル無しの不完全なページ」が
            // 静かに作られて気付きにくいため、ここでは早期 return して操作を止める。
            //
            // On quota-exceed we surface an upgrade prompt and abort the entire
            // submit. Silently creating a thumbnail-less page would hide the
            // problem from the user, so make the failure explicit.
            toast({
              title: t("editor.webClipper.quotaExceeded"),
              description: t("editor.webClipper.quotaExceededDescription"),
              variant: "destructive",
              action: (
                <ToastAction
                  altText={t("editor.webClipper.upgradeCta")}
                  onClick={() => navigate("/pricing")}
                >
                  {t("editor.webClipper.upgradeCta")}
                </ToastAction>
              ),
            });
            return;
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
        // `onClipped` (= ページ作成 + 遷移) は非同期。完了するまで dialog を閉じず、
        // `isSubmitting` も保持する。失敗時は呼び出し先 (handleWebClipped) が toast
        // とロールバックを担当しているので、ここでは dialog を開いたままにして
        // ユーザーがリトライ・キャンセルを選べる状態に戻すだけ。
        //
        // `onClipped` (page create + navigate) is async. Await it before
        // closing the dialog and keep `isSubmitting` true throughout so the UI
        // doesn't dismiss before the page actually exists. On failure the
        // callee already shows a toast and rolls back the committed thumbnail;
        // we simply leave the dialog open so the user can retry or cancel.
        try {
          await onClipped(
            clippedContent.title,
            tiptapContent,
            clippedContent.sourceUrl,
            committedThumbnail ?? undefined,
            committedObjectId ?? undefined,
          );
        } catch {
          if (submitGeneration !== submitGenerationRef.current) return;
          return;
        }
        if (submitGeneration !== submitGenerationRef.current) return;
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
    navigate,
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
