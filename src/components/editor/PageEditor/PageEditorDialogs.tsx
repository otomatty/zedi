import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PageEditorDialogsProps {
  // Delete confirmation dialog
  deleteConfirmOpen: boolean;
  deleteReason: string;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;

  // Wiki generator error dialog
  wikiStatus: string;
  wikiErrorMessage: string | null;
  onResetWiki: () => void;
  onGoToAISettings: () => void;

}

/**
 * All dialogs used in PageEditor
 * - Delete confirmation dialog
 * - Wiki generator error dialog
 * - Web clipper dialog
 */
export const PageEditorDialogs: React.FC<PageEditorDialogsProps> = ({
  deleteConfirmOpen,
  deleteReason,
  onDeleteConfirmOpenChange,
  onConfirmDelete,
  onCancelDelete,
  wikiStatus,
  wikiErrorMessage,
  onResetWiki,
  onGoToAISettings,
}) => {
  return (
    <>
      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={onDeleteConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ページを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReason}
              は保存できません。このページにはコンテンツが含まれています。削除してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelDelete}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Wiki生成エラーダイアログ */}
      <Dialog open={wikiStatus === "error"} onOpenChange={() => onResetWiki()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              生成エラー
            </DialogTitle>
            <DialogDescription>
              {wikiErrorMessage === "AI_NOT_CONFIGURED"
                ? "AI設定が必要です。設定画面でAPIキーを入力してください。"
                : wikiErrorMessage || "生成中にエラーが発生しました。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {wikiErrorMessage === "AI_NOT_CONFIGURED" ? (
              <Button onClick={onGoToAISettings}>設定画面へ</Button>
            ) : (
              <Button variant="outline" onClick={() => onResetWiki()}>
                閉じる
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
