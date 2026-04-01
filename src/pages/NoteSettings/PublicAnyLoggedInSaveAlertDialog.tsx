import type { JSX } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * Props for the save confirmation dialog (public or unlisted + any_logged_in).
 * 保存前確認ダイアログの Props（公開または限定公開URL + any_logged_in）。
 */
export type PublicAnyLoggedInSaveAlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSaving: boolean;
};

/**
 * Confirmation before saving with open collaboration (public or unlisted + any_logged_in).
 * 公開または限定公開(URL) + any_logged_in で保存する前の確認ダイアログ。
 */
export function PublicAnyLoggedInSaveAlertDialog({
  open,
  onOpenChange,
  onConfirm,
  isSaving,
}: PublicAnyLoggedInSaveAlertDialogProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isSaving) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("notes.publicAnyLoggedInConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("notes.publicAnyLoggedInConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSaving}>
            {isSaving ? t("common.saving") : t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
