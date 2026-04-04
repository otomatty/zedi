import React from "react";
import { useTranslation } from "react-i18next";
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

/**
 * Props for {@link ExecutableCodeBlockConfirmDialog}.
 * {@link ExecutableCodeBlockConfirmDialog} のプロパティ。
 */
export interface ExecutableCodeBlockConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmRun: () => void;
}

/**
 * Confirmation before running user code via Claude Code Bash.
 * Claude Code Bash によるユーザーコード実行前の確認。
 */
export function ExecutableCodeBlockConfirmDialog({
  open,
  onOpenChange,
  onConfirmRun,
}: ExecutableCodeBlockConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("editor.executableCode.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("editor.executableCode.confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("editor.executableCode.confirmCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmRun}>
            {t("editor.executableCode.confirmRun")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
