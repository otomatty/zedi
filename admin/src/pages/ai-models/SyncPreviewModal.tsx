import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@zedi/ui";
import type { SyncPreviewResult } from "@/api/admin";

interface SyncPreviewModalProps {
  open: boolean;
  loading: boolean;
  previewData: SyncPreviewResult[] | null;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * モデル同期のプレビュー結果を表示し、同期実行を確認するモーダル。
 * Modal to review model sync changes before confirmation.
 */
export function SyncPreviewModal({
  open,
  loading,
  previewData,
  onClose,
  onConfirm,
}: SyncPreviewModalProps) {
  const { t } = useTranslation();
  const totalToAdd = previewData?.reduce((sum, r) => sum + (r.toAdd?.length ?? 0), 0) ?? 0;
  const totalToDeactivate =
    previewData?.reduce((sum, r) => sum + (r.toDeactivate?.length ?? 0), 0) ?? 0;
  const hasPreviewErrors = previewData?.some((r) => r.error) ?? false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[80vh] overflow-auto max-[768px]:max-w-[calc(100vw-2rem)]"
        aria-describedby="sync-preview-description"
      >
        <DialogHeader>
          <DialogTitle id="sync-preview-title">{t("aiModels.preview.title")}</DialogTitle>
          <DialogDescription id="sync-preview-description">
            {t("aiModels.preview.description")}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground mt-4">{t("common.loading")}</p>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {previewData?.map((r) => (
                <div key={r.provider} className="border-border rounded border p-2">
                  <div className="text-foreground font-medium">
                    {r.provider}
                    {r.error && <span className="text-destructive ml-2">({r.error})</span>}
                  </div>
                  {r.toAdd && r.toAdd.length > 0 ? (
                    <ul className="text-muted-foreground mt-1 list-inside list-disc text-sm">
                      {r.toAdd.map((m) => (
                        <li key={m.id}>
                          {t("aiModels.preview.addLabel", { name: m.displayName })}
                          {!m.isActive && (
                            <span className="ml-1 text-amber-400">
                              {t("aiModels.preview.inactiveTag")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {r.toDeactivate && r.toDeactivate.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-amber-300">
                      {r.toDeactivate.map((m) => (
                        <li key={m.id}>
                          {t("aiModels.preview.deactivateLabel", { name: m.displayName })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!r.error &&
                  (r.toAdd?.length ?? 0) === 0 &&
                  (r.toDeactivate?.length ?? 0) === 0 ? (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t("aiModels.preview.noChanges")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {hasPreviewErrors && (
                <p className="text-sm text-amber-400">{t("aiModels.preview.errorWarning")}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button type="button" onClick={onConfirm}>
                  {t("aiModels.preview.confirm", {
                    added: totalToAdd,
                    deactivated: totalToDeactivate,
                  })}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
