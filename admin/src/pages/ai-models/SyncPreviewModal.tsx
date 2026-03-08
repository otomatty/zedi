import { useRef } from "react";
import type { SyncPreviewResult } from "@/api/admin";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

interface SyncPreviewModalProps {
  open: boolean;
  loading: boolean;
  previewData: SyncPreviewResult[] | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function SyncPreviewModal({
  open,
  loading,
  previewData,
  onClose,
  onConfirm,
}: SyncPreviewModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogFocusTrap({
    open,
    onClose,
    dialogRef,
    initialFocusRef: cancelButtonRef,
  });

  if (!open) return null;

  const totalToAdd = previewData?.reduce((sum, r) => sum + (r.toAdd?.length ?? 0), 0) ?? 0;
  const totalToDeactivate =
    previewData?.reduce((sum, r) => sum + (r.toDeactivate?.length ?? 0), 0) ?? 0;
  const hasPreviewErrors = previewData?.some((r) => r.error) ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-preview-title"
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded bg-slate-800 p-4 shadow-xl max-[768px]:mx-4 max-[768px]:max-w-[calc(100vw-2rem)]"
      >
        <h2 id="sync-preview-title" className="text-lg font-semibold text-slate-200">
          同期プレビュー
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          新規モデルは追加され、同期対象から外れた既存モデルは非アクティブ化されます。
          既存モデルの表示名や料金は上書きされません。Sonnet 系は非アクティブで追加されます。
        </p>
        {loading ? (
          <p className="mt-4 text-slate-400">読み込み中...</p>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              {previewData?.map((r) => (
                <div key={r.provider} className="rounded border border-slate-600 p-2">
                  <div className="font-medium text-slate-300">
                    {r.provider}
                    {r.error && <span className="ml-2 text-red-400">({r.error})</span>}
                  </div>
                  {r.toAdd && r.toAdd.length > 0 ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-slate-400">
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
                  {!r.error && r.toAdd.length === 0 && r.toDeactivate.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">変更なし</p>
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
              <div className="flex justify-end gap-2">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={onClose}
                  className="rounded bg-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-500"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-teal-100 hover:bg-teal-600 disabled:opacity-50"
                >
                  同期実行（追加 {totalToAdd} / 無効化 {totalToDeactivate}）
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
