import React from "react";
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
  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ページを作成しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            「{pageTitle}」というタイトルのページはまだ存在しません。
            新しいページを作成しますか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>作成する</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
