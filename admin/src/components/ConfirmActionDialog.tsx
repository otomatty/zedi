import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  Input,
  Label,
} from "@zedi/ui";
import { cn } from "@zedi/ui/lib/utils";

/**
 * ConfirmActionDialog のプロパティ。
 * Props for the ConfirmActionDialog component.
 */
export interface ConfirmActionDialogProps {
  /** ダイアログの開閉状態 / Whether the dialog is open */
  open: boolean;
  /** 開閉状態変更コールバック / Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** ダイアログタイトル / Dialog title */
  title: string;
  /** ダイアログの説明文 / Dialog description */
  description: string;
  /** 確認ボタンのラベル（デフォルト: "確認"）/ Confirm button label (default: "確認") */
  confirmLabel?: string;
  /** 破壊的操作かどうか（赤系スタイル適用）/ Whether this is a destructive action */
  destructive?: boolean;
  /** ローディング状態 / Whether the confirm action is loading */
  loading?: boolean;
  /**
   * 確認フレーズ。設定するとユーザーにこのフレーズの入力を求め、
   * 一致しない限り確認ボタンが無効化される。
   *
   * If set, user must type this exact phrase to enable the confirm button.
   */
  confirmPhrase?: string;
  /** 確認フレーズのラベル / Label for confirm phrase input */
  confirmPhraseLabel?: string;
  /** 確認ボタン押下時のコールバック / Called when user confirms */
  onConfirm: () => void;
  /** タイトル・説明以外の追加コンテンツ（影響範囲の表示等）/ Additional content between description and actions */
  children?: React.ReactNode;
}

/**
 * 再利用可能な確認ダイアログコンポーネント。
 * 破壊的・不可逆的な操作の前にユーザーの明示的な確認を求める。
 *
 * Reusable confirmation dialog component.
 * Requires explicit user confirmation before destructive or irreversible actions.
 *
 * @example
 * ```tsx
 * <ConfirmActionDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="ロールを変更"
 *   description="このユーザーのロールを admin に変更しますか？"
 *   destructive
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  loading = false,
  confirmPhrase,
  confirmPhraseLabel,
  onConfirm,
  children,
}: ConfirmActionDialogProps) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t("common.confirm");
  const [phraseInput, setPhraseInput] = useState("");

  // ダイアログ閉じ時に確認フレーズ入力をリセット / Reset phrase input when dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setPhraseInput("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const phraseMatches = !confirmPhrase || phraseInput === confirmPhrase;
  const canConfirm = phraseMatches && !loading;

  const handleConfirm = () => {
    if (!canConfirm) return;
    setPhraseInput("");
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {(children || confirmPhrase) && (
          <div className="grid gap-4 py-2">
            {children}
            {confirmPhrase && (
              <div className="grid gap-2">
                <Label htmlFor="confirm-phrase-input">
                  {confirmPhraseLabel ??
                    t("common.confirmPhraseDefault", { phrase: confirmPhrase })}
                </Label>
                <Input
                  id="confirm-phrase-input"
                  value={phraseInput}
                  onChange={(e) => setPhraseInput(e.target.value)}
                  placeholder={confirmPhrase}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            disabled={!canConfirm}
            onClick={(e) => {
              // AlertDialogAction は自動的にダイアログを閉じるため、
              // ローディング中やフレーズ不一致時は閉じないようにする
              // Prevent auto-close when disabled
              if (!canConfirm) {
                e.preventDefault();
                return;
              }
              handleConfirm();
            }}
          >
            {loading ? t("common.processing") : resolvedConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
