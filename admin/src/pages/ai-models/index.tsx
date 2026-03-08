import { useCallback, useEffect, useRef, useState } from "react";
import type { AiModelAdmin, SyncPreviewResult, SyncResultItem } from "@/api/admin";
import { getAiModels, previewSyncAiModels, syncAiModels as syncAiModelsApi } from "@/api/admin";
import { AiModelsContent } from "./AiModelsContent";
import { useAiModelActions } from "./useAiModelActions";
import { useAiModelsDragReorder } from "./useAiModelsDragReorder";

export default function AiModels() {
  const [models, setModels] = useState<AiModelAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultItem[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<SyncPreviewResult[] | null>(null);
  const isMountedRef = useRef(true);
  const originalModelsRef = useRef<AiModelAdmin[]>([]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading && isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);
    try {
      const nextModels = await getAiModels();
      if (!isMountedRef.current) return;
      setModels(nextModels);
      originalModelsRef.current = nextModels;
      setError(null);
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  const { handleModelUpdate, handleToggleActive, handleTierChange } = useAiModelActions({
    setModels,
    setError,
    isMountedRef,
    originalModelsRef,
  });

  const dragReorder = useAiModelsDragReorder({
    models,
    setModels,
    setError,
    isMountedRef,
    load,
  });

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  const handlePreviewClick = useCallback(async () => {
    setPreviewData(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const results = await previewSyncAiModels();
      if (!isMountedRef.current) return;
      setPreviewData(results);
      setPreviewOpen(true);
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setPreviewOpen(false);
    } finally {
      if (isMountedRef.current) setPreviewLoading(false);
    }
  }, []);

  const handleSyncConfirm = useCallback(() => {
    setPreviewOpen(false);
    setPreviewData(null);
    setSyncing(true);
    setSyncResult(null);
    syncAiModelsApi()
      .then((results) => {
        setSyncResult(results);
        void load(false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSyncing(false));
  }, [load]);

  if (loading && models.length === 0) {
    return (
      <div>
        <h1 className="text-lg font-semibold">AI モデル管理</h1>
        <p className="mt-2 text-slate-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <AiModelsContent
      models={models}
      setModels={setModels}
      error={error}
      syncing={syncing}
      syncResult={syncResult}
      previewOpen={previewOpen}
      previewLoading={previewLoading}
      previewData={previewData}
      draggedId={dragReorder.draggedId}
      dragOverId={dragReorder.dragOverId}
      originalModelsRef={originalModelsRef}
      onPreviewClick={handlePreviewClick}
      onSyncConfirm={handleSyncConfirm}
      onClosePreview={() => {
        setPreviewOpen(false);
        setPreviewData(null);
      }}
      onModelUpdate={handleModelUpdate}
      onTierChange={handleTierChange}
      onToggleActive={handleToggleActive}
      onDragStart={dragReorder.handleDragStart}
      onDragOver={dragReorder.handleDragOver}
      onDragLeave={dragReorder.handleDragLeave}
      onDrop={dragReorder.handleDrop}
      onDragEnd={dragReorder.handleDragEnd}
    />
  );
}
