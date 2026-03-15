import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, AlertCircle } from "lucide-react";
import { Input } from "@zedi/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@zedi/ui";
import { Alert, AlertDescription } from "@zedi/ui";
import { useWebClipper, type WebClipperStatus } from "@/hooks/useWebClipper";
import { useAuth } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import { useWebClipperDialogState } from "./useWebClipperDialogState";
import { useWebClipperDialogSubmit } from "./useWebClipperDialogSubmit";
import { WebClipperDialogPreview } from "./WebClipperDialogPreview";
import { WebClipperDialogFooter } from "./WebClipperDialogFooter";

interface WebClipperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClipped: (
    title: string,
    content: string,
    sourceUrl: string,
    thumbnailUrl?: string | null,
  ) => void;
  /** Chrome拡張等から渡される初期URL。開いた時にプリフィルする。 */
  initialUrl?: string;
}

/**
 * Web ページクリッピングダイアログ。URL を入力して Web ページのコンテンツを取り込む。
 * Web page clipping dialog. Enter a URL to import content from a web page.
 */
export const WebClipperDialog: React.FC<WebClipperDialogProps> = ({
  open,
  onOpenChange,
  onClipped,
  initialUrl,
}) => {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const api = useMemo(() => createApiClient({ getToken }), [getToken]);
  const { status, clippedContent, error, clip, reset, getTiptapContent } = useWebClipper({ api });
  const { url, setUrl, handlePaste, resetDialogState, isCurrentUrlClipped } =
    useWebClipperDialogState({ clip, reset });

  const hasFreshContent = Boolean(clippedContent) && isCurrentUrlClipped();

  const submit = useWebClipperDialogSubmit({
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
  });

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

  return (
    <Dialog open={open} onOpenChange={submit.handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="web-clipper-dialog">
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
              onKeyDown={submit.handleKeyDown}
              disabled={submit.isBusy}
              className="font-mono text-sm"
              autoFocus
            />
          </div>

          {(status === "fetching" || status === "extracting") && (
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
          isBusy={submit.isBusy}
          hasContent={hasFreshContent}
          onCancel={() => submit.handleDialogOpenChange(false)}
          onSubmit={submit.handleClip}
        />
      </DialogContent>
    </Dialog>
  );
};
