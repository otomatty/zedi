import { Button, Table, TableBody, TableHead, TableHeader, TableRow } from "@zedi/ui";
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

/**
 *
 */
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
  function createDisplayNameHandlers(model: AiModelAdmin) {
    return {
      onDisplayNameChange: (value: string) =>
        setModels((prev) =>
          prev.map((x) => (x.id === model.id ? { ...x, displayName: value } : x)),
        ),
      onDisplayNameBlur: (v: string) => {
        if (v !== model.displayName) {
          setModels((prev) => prev.map((x) => (x.id === model.id ? { ...x, displayName: v } : x)));
        }
        /**
         *
         */
        const originalModel = originalModelsRef.current.find((om) => om.id === model.id);
        if (originalModel && v !== originalModel.displayName) {
          void onModelUpdate(originalModel, { displayName: v });
        }
      },
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">AI モデル管理</h1>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onPreviewClick}
          disabled={syncing}
        >
          {syncing ? "同期中..." : "プロバイダーと同期"}
        </Button>
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
      <div className="mt-4 hidden md:block">
        <Table className="border-border min-w-[640px] rounded border">
          <TableHeader>
            <TableRow className="border-border bg-muted/50 hover:bg-transparent">
              <TableHead className="w-8 px-1 py-2" aria-label="並び替え" />
              <TableHead className="px-3 py-2">プロバイダー</TableHead>
              <TableHead className="px-3 py-2">モデルID</TableHead>
              <TableHead className="px-3 py-2">表示名</TableHead>
              <TableHead className="px-3 py-2">ティア</TableHead>
              <TableHead className="px-3 py-2">有効</TableHead>
              <TableHead className="px-3 py-2">並び順</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <AiModelRow
                key={m.id}
                model={m}
                draggedId={draggedId}
                dragOverId={dragOverId}
                {...createDisplayNameHandlers(m)}
                onTierChange={(tier) => onTierChange(m, tier)}
                onToggleActive={() => onToggleActive(m)}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* モバイル: リスト（カード） */}
      <div className="mt-4 space-y-3 md:hidden">
        {models.map((m) => (
          <AiModelCard
            key={m.id}
            model={m}
            {...createDisplayNameHandlers(m)}
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
