import React, { useCallback } from "react";
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

interface StorageSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const StorageSetupDialog: React.FC<StorageSetupDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const handleConfirm = useCallback(() => {
    onOpenChange(false);
    onConfirm();
  }, [onConfirm, onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>画像ストレージを設定してください</AlertDialogTitle>
          <AlertDialogDescription>
            画像を挿入するにはストレージ設定が必要です。今すぐ設定しますか？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>あとで</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>今すぐ設定</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
