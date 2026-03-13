import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link2, Loader2, AlertCircle, Check, ExternalLink } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@zedi/ui";
import { Alert, AlertDescription } from "@zedi/ui";
import { useNavigate } from "react-router-dom";
import { useWebClipper, type WebClipperStatus } from "@/hooks/useWebClipper";
import { isValidUrl } from "@/lib/webClipper";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { commitThumbnailFromUrl, AuthRedirectError } from "@/lib/thumbnailCommit";
import { getThumbnailApiBaseUrl } from "@/components/editor/TiptapEditor/thumbnailApiHelpers";
import { useToast } from "@zedi/ui";

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
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const { status, clippedContent, error, clip, reset, getTiptapContent } = useWebClipper({ api });
  const lastClippedUrlRef = useRef<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // URL変更時に前回の解析結果をリセット（進行中の clip は潰さない）
  useEffect(() => {
    if (!url) {
      reset();
    } else if (status === "completed" || status === "error") {
      reset();
    }
  }, [url, status, reset]);

  // エラー時に lastClippedUrlRef をクリアして同一URLのリトライを可能に
  useEffect(() => {
    if (status === "error") {
      lastClippedUrlRef.current = "";
    }
  }, [status]);

  // 有効なURLを検知したら自動で clip を実行（debounce 500ms）
  const triggerAutoClip = useDebouncedCallback(
    useCallback(() => {
      const trimmed = url.trim();
      if (!trimmed || !isValidUrl(trimmed)) return;
      if (trimmed === lastClippedUrlRef.current) return;
      lastClippedUrlRef.current = trimmed;
      clip(trimmed);
    }, [url, clip]),
    500,
  );

  useEffect(() => {
    triggerAutoClip();
  }, [url, triggerAutoClip]);

  // 貼り付け時に有効なURLなら即時 clip
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text").trim();
      if (text && isValidUrl(text)) {
        e.preventDefault();
        setUrl(text);
        setUrlError(null);
        if (text !== lastClippedUrlRef.current) {
          lastClippedUrlRef.current = text;
          clip(text);
        }
      }
    },
    [clip],
  );

  // ダイアログを閉じたときにリセット
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setUrl("");
        setUrlError(null);
      });
      lastClippedUrlRef.current = "";
      reset();
    }
  }, [open, reset]);

  // 取り込み実行（clippedContent をそのまま使用、再 fetch なし）
  const handleClip = async () => {
    if (!clippedContent) return;

    setIsSubmitting(true);
    let committedThumbnail: string | undefined;
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
          committedThumbnail = undefined;
        }
      }
      const tiptapContent = getTiptapContent(committedThumbnail);
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
  };

  // Enterキーで実行
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && clippedContent && !isSubmitting) {
      e.preventDefault();
      handleClip();
    }
  };

  const isProcessing = status === "fetching" || status === "extracting";
  const isCompleted = status === "completed";
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
          {/* URL入力 */}
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

          {/* ステータス表示 */}
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusMessages[status]}
            </div>
          )}

          {/* 成功時のプレビュー */}
          {isCompleted && clippedContent && (
            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <div className="space-y-1">
                  <div className="font-medium">{clippedContent.title}</div>
                  {clippedContent.siteName && (
                    <div className="text-xs opacity-70">{clippedContent.siteName}</div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* エラー表示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 注意書き */}
          <p className="text-xs text-muted-foreground">
            💡 対応していないページもあります。著作権にご注意ください。
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            キャンセル
          </Button>
          <Button onClick={handleClip} disabled={isBusy || !clippedContent}>
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                取り込み中...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-4 w-4" />
                取り込み
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
