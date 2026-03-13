import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link2, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@zedi/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@zedi/ui";
import { Alert, AlertDescription } from "@zedi/ui";
import { useNavigate } from "react-router-dom";
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

const statusMessages: Record<WebClipperStatus, string> = {
  idle: "",
  fetching: "ページを取得中...",
  extracting: "本文を抽出中...",
  completed: "取り込み完了",
  error: "",
};

export const WebClipperDialog: React.FC<WebClipperDialogProps> = ({
  open,
  onOpenChange,
  onClipped,
}) => {
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient({ getToken }), [getToken]);
  const { status, clippedContent, error, clip, reset, getTiptapContent } = useWebClipper({ api });
  const { url, setUrl, urlError, setUrlError, lastClippedUrlRef, handlePaste } =
    useWebClipperDialogState({ open, clip, reset });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "error") {
      lastClippedUrlRef.current = "";
    }
  }, [status, lastClippedUrlRef]);

  const handleClip = useCallback(async () => {
    if (!clippedContent) return;

    setIsSubmitting(true);
    let committedThumbnail: string | undefined;
    let committedProvider: string | undefined;
    let commitAttemptedAndFailed = false;
    try {
      if (clippedContent.thumbnailUrl) {
        try {
          const baseUrl = getThumbnailApiBaseUrl();
          if (baseUrl) {
            const result = await commitThumbnailFromUrl(clippedContent.thumbnailUrl, {
              baseUrl,
              title: clippedContent.title,
            });
            committedThumbnail = result.imageUrl;
            committedProvider = result.provider;
          }
        } catch (err) {
          if (isAuthRedirectError(err)) {
            toast({
              title: "ログインが必要です",
              description: "再度ログインしてください",
              variant: "destructive",
            });
            navigate("/sign-in", { replace: true });
            return;
          }
          console.error("Failed to commit thumbnail:", err);
          toast({
            title: "サムネイルの保存に失敗しました",
            description: "コンテンツはそのまま取り込みます。",
            variant: "destructive",
          });
          commitAttemptedAndFailed = true;
        }
      }
      const thumbnailForContent =
        committedThumbnail ?? (commitAttemptedAndFailed ? "" : clippedContent.thumbnailUrl);
      const tiptapContent = getTiptapContent(thumbnailForContent, committedProvider);
      if (tiptapContent) {
        onClipped(
          clippedContent.title,
          tiptapContent,
          clippedContent.sourceUrl,
          committedThumbnail ?? undefined,
        );
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [clippedContent, getTiptapContent, navigate, onClipped, onOpenChange, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && clippedContent && !isSubmitting) {
        e.preventDefault();
        handleClip();
      }
    },
    [clippedContent, isSubmitting, handleClip],
  );

  const isProcessing = status === "fetching" || status === "extracting";
  const isBusy = isProcessing || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            URLから取り込み
          </DialogTitle>
          <DialogDescription>
            Webページの本文を抽出してページとして保存します。 引用元URLは自動的に記録されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              className="font-mono text-sm"
              autoFocus
            />
            {urlError && <p className="text-sm text-destructive">{urlError}</p>}
          </div>

          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusMessages[status]}
            </div>
          )}

          {status === "completed" && clippedContent && (
            <WebClipperDialogPreview clippedContent={clippedContent} />
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            💡 対応していないページもあります。著作権にご注意ください。
          </p>
        </div>

        <WebClipperDialogFooter
          isBusy={isBusy}
          hasContent={Boolean(clippedContent)}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleClip}
        />
      </DialogContent>
    </Dialog>
  );
};
