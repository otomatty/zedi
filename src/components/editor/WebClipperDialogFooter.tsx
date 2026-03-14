import React from "react";
import { useTranslation } from "react-i18next";
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
}) => {
  const { t } = useTranslation();
  return (
    <DialogFooter className="gap-2 sm:gap-0">
      <Button variant="outline" onClick={onCancel} disabled={isBusy}>
        {t("editor.webClipper.cancel")}
      </Button>
      <Button onClick={onSubmit} disabled={isBusy || !hasContent}>
        {isBusy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("editor.webClipper.importing")}
          </>
        ) : (
          <>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("editor.webClipper.import")}
          </>
        )}
      </Button>
    </DialogFooter>
  );
};
