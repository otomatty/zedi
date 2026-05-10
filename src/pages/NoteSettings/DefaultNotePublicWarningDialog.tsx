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
 * Props for the default-note public/unlisted warning dialog.
 * 既定ノート（マイノート）公開時の警告ダイアログ Props。
 */
export type DefaultNotePublicWarningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSaving: boolean;
};

/**
 * Warning dialog shown before flipping a default note to `public` / `unlisted`.
 * Switching exposes every page that the user previously saved into their
 * personal default note, so we surface a heads-up before the save proceeds.
 *
 * 既定ノートを `public` / `unlisted` に変更する前に表示する警告ダイアログ。
 * これまで個人用に保存したページが一括で公開されるリスクを通知する。
 */
export function DefaultNotePublicWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  isSaving,
}: DefaultNotePublicWarningDialogProps): JSX.Element {
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
          <AlertDialogTitle>{t("notes.defaultNotePublicWarningTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("notes.defaultNotePublicWarningDescription")}
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
