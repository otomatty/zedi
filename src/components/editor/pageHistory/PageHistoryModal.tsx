/**
 * ページ変更履歴モーダル
 * Page version history modal
 */
import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as Y from "yjs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Skeleton,
} from "@zedi/ui";
import {
  usePageSnapshots,
  usePageSnapshot,
  useRestorePageSnapshot,
} from "@/hooks/usePageSnapshotQueries";
import { SnapshotList } from "./SnapshotList";
import { SnapshotPreview } from "./SnapshotPreview";
import { SnapshotCompare } from "./SnapshotCompare";
import type { PageSnapshot } from "@/types/pageSnapshot";

interface PageHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  /** 現在の編集用 Y.Doc（比較タブ選択時のみ base64 化する） */
  currentYdoc: Y.Doc | null;
  /** 復元後にエディタをリロードするコールバック */
  onRestored?: () => void;
}

/**
 * 比較表示用に Y.Doc を base64 でエンコードする（重い処理のため Compare タブ時のみ実行）。
 * Encode Y.Doc to base64 for compare — only when Compare tab needs it.
 */
function encodeYdocStateToBase64(ydoc: Y.Doc): string {
  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    const chunks: string[] = [];
    for (let i = 0; i < state.length; i += 8192) {
      chunks.push(String.fromCharCode.apply(null, [...state.subarray(i, i + 8192)]));
    }
    return btoa(chunks.join(""));
  } catch {
    return "";
  }
}

/**
 *
 */
export /**
 *
 */
const PageHistoryModal: React.FC<PageHistoryModalProps> = ({
  open,
  onOpenChange,
  pageId,
  currentYdoc,
  onRestored,
}) => {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const [selectedSnapshot, setSelectedSnapshot] = useState<PageSnapshot | null>(null);
  /**
   *
   */
  const [tab, setTab] = useState<string>("preview");
  /**
   *
   */
  const [confirmOpen, setConfirmOpen] = useState(false);

  /**
   *
   */
  const { data: snapshots, isLoading: isLoadingList } = usePageSnapshots(pageId);
  /**
   *
   */
  const { data: snapshotDetail, isLoading: isLoadingDetail } = usePageSnapshot(
    pageId,
    selectedSnapshot?.id ?? null,
  );
  /**
   *
   */
  const restoreMutation = useRestorePageSnapshot(pageId);

  /** 比較タブがアクティブなときだけ現在ドキュメントをエンコード（協調編集中の負荷を抑える） */
  const currentYdocState = useMemo((): string => {
    if (!open || tab !== "compare" || !currentYdoc) return "";
    return encodeYdocStateToBase64(currentYdoc);
  }, [open, tab, currentYdoc]);

  /**
   *
   */
  const handleSelect = useCallback((snap: PageSnapshot) => {
    setSelectedSnapshot(snap);
  }, []);

  /**
   *
   */
  const handleRestore = useCallback(async () => {
    if (!selectedSnapshot) return;
    try {
      await restoreMutation.mutateAsync(selectedSnapshot.id);
      toast.success(t("editor.pageHistory.restoreSuccess"));
      setConfirmOpen(false);
      onOpenChange(false);
      onRestored?.();
    } catch {
      toast.error(t("editor.pageHistory.restoreError"));
    }
  }, [selectedSnapshot, restoreMutation, t, onOpenChange, onRestored]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[80vh] max-h-[700px] w-full max-w-4xl flex-col gap-0 p-0"
          hideCloseButton={false}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{t("editor.pageHistory.title")}</DialogTitle>
            <DialogDescription>{t("editor.pageHistory.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1">
            <div className="w-56 shrink-0 border-r">
              {isLoadingList ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <SnapshotList
                  snapshots={snapshots ?? []}
                  selectedId={selectedSnapshot?.id ?? null}
                  onSelect={handleSelect}
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              {!selectedSnapshot ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-muted-foreground text-sm">
                    {t("editor.pageHistory.selectSnapshot")}
                  </p>
                </div>
              ) : (
                <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <TabsList>
                      <TabsTrigger value="preview">{t("editor.pageHistory.preview")}</TabsTrigger>
                      <TabsTrigger value="compare">{t("editor.pageHistory.compare")}</TabsTrigger>
                    </TabsList>

                    <Button
                      size="sm"
                      onClick={() => setConfirmOpen(true)}
                      disabled={restoreMutation.isPending}
                    >
                      {t("editor.pageHistory.restoreButton")}
                    </Button>
                  </div>

                  <TabsContent value="preview" className="mt-0 flex-1 overflow-auto p-4">
                    {isLoadingDetail ? (
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>
                    ) : snapshotDetail ? (
                      <SnapshotPreview ydocState={snapshotDetail.ydocState} />
                    ) : null}
                  </TabsContent>

                  <TabsContent value="compare" className="mt-0 flex-1 overflow-auto p-4">
                    {isLoadingDetail ? (
                      <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-48 w-full" />
                        <Skeleton className="h-48 w-full" />
                      </div>
                    ) : snapshotDetail ? (
                      <SnapshotCompare
                        selectedYdocState={snapshotDetail.ydocState}
                        currentYdocState={currentYdocState}
                      />
                    ) : null}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("editor.pageHistory.restoreConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("editor.pageHistory.restoreConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>
              {t("editor.pageHistory.restoreConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoreMutation.isPending}>
              {restoreMutation.isPending
                ? t("editor.pageHistory.restoring")
                : t("editor.pageHistory.restoreConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
