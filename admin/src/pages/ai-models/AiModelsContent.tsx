import type { AiModelAdmin, SyncPreviewResult, SyncResultItem } from "@/api/admin";
import { AiModelCard } from "./AiModelCard";
import { AiModelRow } from "./AiModelRow";
import { SyncPreviewModal } from "./SyncPreviewModal";

interface AiModelsContentProps {
  models: AiModelAdmin[];
  setModels: React.Dispatch<React.SetStateAction<AiModelAdmin[]>>;
  error: string | null;
  syncing: boolean;
  syncResult: SyncResultItem[] | null;
  previewOpen: boolean;
  previewLoading: boolean;
  previewData: SyncPreviewResult[] | null;
  draggedId: string | null;
  dragOverId: string | null;
  originalModelsRef: React.MutableRefObject<AiModelAdmin[]>;
  onPreviewClick: () => void;
  onSyncConfirm: () => void;
  onClosePreview: () => void;
  onModelUpdate: (
    model: AiModelAdmin,
    updates: Partial<
      Pick<
        AiModelAdmin,
        | "displayName"
        | "tierRequired"
        | "inputCostUnits"
        | "outputCostUnits"
        | "isActive"
        | "sortOrder"
      >
    >,
  ) => Promise<void>;
  onTierChange: (m: AiModelAdmin, tier: "free" | "pro") => Promise<void>;
  onToggleActive: (m: AiModelAdmin) => Promise<void>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, toId: string) => void;
  onDragEnd: () => void;
}

export function AiModelsContent({
  models,
  setModels,
  error,
  syncing,
  syncResult,
  previewOpen,
  previewLoading,
  previewData,
  draggedId,
  dragOverId,
  originalModelsRef,
  onPreviewClick,
  onSyncConfirm,
  onClosePreview,
  onModelUpdate,
  onTierChange,
  onToggleActive,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AiModelsContentProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">AI モデル管理</h1>
        <button
          type="button"
          onClick={onPreviewClick}
          disabled={syncing}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
        >
          {syncing ? "同期中..." : "プロバイダーと同期"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      {syncResult && (
        <div className="mt-2 rounded bg-slate-800 px-3 py-2 text-sm text-slate-300">
          <span className="font-medium">同期結果:</span>{" "}
          {syncResult.map((r) => (
            <span key={r.provider} className="mr-3">
              {r.provider}: {r.error ?? `追加 ${r.upserted} / 無効化 ${r.deactivated ?? 0}`}
            </span>
          ))}
        </div>
      )}

      <SyncPreviewModal
        open={previewOpen}
        loading={previewLoading}
        previewData={previewData}
        onClose={onClosePreview}
        onConfirm={onSyncConfirm}
      />

      {/* デスクトップ: テーブル */}
      <div className="mt-4 hidden overflow-x-auto rounded border border-slate-700 md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="w-8 px-1 py-2" aria-label="並び替え" />
              <th className="px-3 py-2 font-medium text-slate-300">プロバイダー</th>
              <th className="px-3 py-2 font-medium text-slate-300">モデルID</th>
              <th className="px-3 py-2 font-medium text-slate-300">表示名</th>
              <th className="px-3 py-2 font-medium text-slate-300">ティア</th>
              <th className="px-3 py-2 font-medium text-slate-300">有効</th>
              <th className="px-3 py-2 font-medium text-slate-300">並び順</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <AiModelRow
                key={m.id}
                model={m}
                draggedId={draggedId}
                dragOverId={dragOverId}
                onDisplayNameChange={(value) =>
                  setModels((prev) =>
                    prev.map((x) => (x.id === m.id ? { ...x, displayName: value } : x)),
                  )
                }
                onDisplayNameBlur={(v) => {
                  if (v !== m.displayName) {
                    setModels((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, displayName: v } : x)),
                    );
                  }
                  const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
                  if (originalModel && v !== originalModel.displayName) {
                    void onModelUpdate(originalModel, { displayName: v });
                  }
                }}
                onTierChange={(tier) => onTierChange(m, tier)}
                onToggleActive={() => onToggleActive(m)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* モバイル: リスト（カード） */}
      <div className="mt-4 space-y-3 md:hidden">
        {models.map((m) => (
          <AiModelCard
            key={m.id}
            model={m}
            onDisplayNameChange={(value) =>
              setModels((prev) =>
                prev.map((x) => (x.id === m.id ? { ...x, displayName: value } : x)),
              )
            }
            onDisplayNameBlur={(v) => {
              if (v !== m.displayName) {
                setModels((prev) =>
                  prev.map((x) => (x.id === m.id ? { ...x, displayName: v } : x)),
                );
              }
              const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
              if (originalModel && v !== originalModel.displayName) {
                void onModelUpdate(originalModel, { displayName: v });
              }
            }}
            onTierChange={(tier) => onTierChange(m, tier)}
            onToggleActive={() => onToggleActive(m)}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {models.length} 件（有効: {models.filter((m) => m.isActive).length}）
        <span className="hidden md:inline"> ドラッグで並び替え</span>
      </p>
    </div>
  );
}
