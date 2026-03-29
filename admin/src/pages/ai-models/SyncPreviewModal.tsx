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
          <DialogTitle id="sync-preview-title">同期プレビュー</DialogTitle>
          <DialogDescription id="sync-preview-description">
            新規モデルは追加され、同期対象から外れた既存モデルは非アクティブ化されます。
            既存モデルの表示名や料金は上書きされません。Sonnet 系は非アクティブで追加されます。
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground mt-4">読み込み中...</p>
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
                          追加: {m.displayName}
                          {!m.isActive && (
                            <span className="ml-1 text-amber-400">(非アクティブ)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {r.toDeactivate && r.toDeactivate.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-amber-300">
                      {r.toDeactivate.map((m) => (
                        <li key={m.id}>無効化: {m.displayName}</li>
                      ))}
                    </ul>
                  ) : null}
                  {!r.error &&
                  (r.toAdd?.length ?? 0) === 0 &&
                  (r.toDeactivate?.length ?? 0) === 0 ? (
                    <p className="text-muted-foreground mt-1 text-sm">変更なし</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {hasPreviewErrors && (
                <p className="text-sm text-amber-400">
                  一部プロバイダーでエラーが発生しています。エラーのあるプロバイダーは同期されません。
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={onClose}>
                  キャンセル
                </Button>
                <Button type="button" onClick={onConfirm}>
                  同期実行（追加 {totalToAdd} / 無効化 {totalToDeactivate}）
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
