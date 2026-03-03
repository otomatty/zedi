import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link2, Loader2, AlertCircle, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWebClipper, type WebClipperStatus } from "@/hooks/useWebClipper";
import { isValidUrl } from "@/lib/webClipper";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";

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

  // ダイアログを閉じたときにリセット
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setUrl("");
        setUrlError(null);
      });
      reset();
    }
  }, [open, reset]);

  // URL入力のバリデーション
  const validateUrl = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setUrlError("URLを入力してください");
      return false;
    }
    if (!isValidUrl(value)) {
      setUrlError("有効なURLを入力してください（http:// または https://）");
      return false;
    }
    setUrlError(null);
    return true;
  }, []);

  // 取り込み実行
  const handleClip = async () => {
    if (!validateUrl(url)) return;

    const result = await clip(url);

    if (result) {
      const tiptapContent = getTiptapContent();
      if (tiptapContent) {
        onClipped(result.title, tiptapContent, result.sourceUrl, result.thumbnailUrl);
        onOpenChange(false);
      }
    }
  };

  // Enterキーで実行
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && status === "idle") {
      e.preventDefault();
      handleClip();
    }
  };

  const isProcessing = status === "fetching" || status === "extracting";
  const isCompleted = status === "completed";

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
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            キャンセル
          </Button>
          <Button onClick={handleClip} disabled={isProcessing || !url.trim()}>
            {isProcessing ? (
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
