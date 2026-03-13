import React from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { Button, DialogFooter } from "@zedi/ui";

interface WebClipperDialogFooterProps {
  isBusy: boolean;
  hasContent: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export const WebClipperDialogFooter: React.FC<WebClipperDialogFooterProps> = ({
  isBusy,
  hasContent,
  onCancel,
  onSubmit,
}) => (
  <DialogFooter className="gap-2 sm:gap-0">
    <Button variant="outline" onClick={onCancel} disabled={isBusy}>
      キャンセル
    </Button>
    <Button onClick={onSubmit} disabled={isBusy || !hasContent}>
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
);
