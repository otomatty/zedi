import React, { useCallback, useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import {
  FILE_PREVIEW_EVENT,
  type FilePreviewEventDetail,
} from "@/lib/noteWorkspace/filePreviewEvents";

/**
 * Global listener for {@link FILE_PREVIEW_EVENT}; shows scrollable preview (Issue #461).
 * {@link FILE_PREVIEW_EVENT} を購読し、スクロール可能なプレビューを表示（Issue #461）。
 */
export function FilePreviewDialogHost(): React.ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FilePreviewEventDetail | null>(null);

  const onEvent = useCallback((ev: Event) => {
    const ce = ev as CustomEvent<FilePreviewEventDetail>;
    setDetail(ce.detail ?? null);
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(FILE_PREVIEW_EVENT, onEvent);
    return () => window.removeEventListener(FILE_PREVIEW_EVENT, onEvent);
  }, [onEvent]);

  const close = useCallback(() => {
    setOpen(false);
    setDetail(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[min(85vh,720px)] max-w-3xl overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">
            {detail?.relativePath ?? ""}
          </DialogTitle>
        </DialogHeader>
        {detail?.noWorkspace ? (
          <p className="text-muted-foreground text-sm">{t("editor.filePreview.noWorkspace")}</p>
        ) : detail?.error ? (
          <p className="text-destructive text-sm">{detail.error}</p>
        ) : (
          <>
            {detail?.truncated ? (
              <p className="text-muted-foreground text-xs">{t("editor.filePreview.truncated")}</p>
            ) : null}
            <pre className="bg-muted/50 max-h-[min(55vh,480px)] overflow-auto rounded-md border p-3 font-mono text-xs break-words whitespace-pre-wrap">
              {detail?.content ?? ""}
            </pre>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            {t("editor.filePreview.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
