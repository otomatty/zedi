import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@zedi/ui";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface CreatePageDialogProps {
  open: boolean;
  pageTitle: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog to confirm creation of a new page when clicking on a non-existent WikiLink
 */
export const CreatePageDialog: React.FC<CreatePageDialogProps> = ({
  open,
  pageTitle,
  onConfirm,
  onCancel,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap({
    open,
    onClose: onCancel,
    dialogRef,
    initialFocusRef: cancelButtonRef,
  });

  // SSR / pre-hydration: createPortal は document が必要なため、未定義の場合は描画しない
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="create-page-dialog-title"
        aria-describedby="create-page-dialog-description"
        className="grid w-full max-w-lg gap-4 rounded-lg border bg-background p-6 shadow-lg"
      >
        <div className="flex flex-col space-y-2 text-center sm:text-left">
          <h2 id="create-page-dialog-title" className="text-lg font-semibold">
            ページを作成しますか？
          </h2>
          <p id="create-page-dialog-description" className="text-sm text-muted-foreground">
            「{pageTitle}」というタイトルのページはまだ存在しません。 新しいページを作成しますか？
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <Button ref={cancelButtonRef} variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
          <Button onClick={onConfirm}>作成する</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
