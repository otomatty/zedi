import { useCallback, useEffect, useRef, useState } from "react";
import type { AiModelAdmin, SyncPreviewResult, SyncResultItem } from "@/api/admin";
import {
  getAiModels,
  patchAiModel,
  patchAiModelsBulk,
  previewSyncAiModels,
  syncAiModels as syncAiModelsApi,
} from "@/api/admin";

export default function AiModels() {
  const [models, setModels] = useState<AiModelAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultItem[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<SyncPreviewResult[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
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

  const handleModelUpdate = async (
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
  ) => {
    const rollbackUpdates = Object.fromEntries(
      Object.keys(updates).map((key) => [key, model[key as keyof typeof updates]]),
    ) as typeof updates;

    if (!isMountedRef.current) return;
    setError(null);
    setModels((prevModels) =>
      prevModels.map((x) => (x.id === model.id ? { ...x, ...updates } : x)),
    );
    try {
      await patchAiModel(model.id, updates);
      originalModelsRef.current = originalModelsRef.current.map((x) =>
        x.id === model.id ? { ...x, ...updates } : x,
      );
    } catch (e) {
      if (!isMountedRef.current) return;
      setModels((prevModels) =>
        prevModels.map((x) => (x.id === model.id ? { ...x, ...rollbackUpdates } : x)),
      );
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleActive = async (m: AiModelAdmin) => {
    await handleModelUpdate(m, { isActive: !m.isActive });
  };

  const handleTierChange = async (m: AiModelAdmin, tier: "free" | "pro") => {
    if (m.tierRequired === tier) return;
    await handleModelUpdate(m, { tierRequired: tier });
  };

  const handleReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const reordered = [...models];
      const [removed] = reordered.splice(fromIndex, 1);
      if (!removed) return;
      reordered.splice(toIndex, 0, removed);
      const updates = reordered.map((m, i) => ({ id: m.id, sortOrder: i }));
      setError(null);
      setModels(reordered.map((m, i) => ({ ...m, sortOrder: i })));
      try {
        await patchAiModelsBulk(updates);
      } catch (e) {
        if (!isMountedRef.current) return;
        void load(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [models, load],
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/json", JSON.stringify({ id }));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toId: string) => {
      e.preventDefault();
      setDraggedId(null);
      setDragOverId(null);
      const fromId = e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === toId) return;
      const fromIndex = models.findIndex((m) => m.id === fromId);
      const toIndex = models.findIndex((m) => m.id === toId);
      if (fromIndex === -1 || toIndex === -1) return;
      void handleReorder(fromIndex, toIndex);
    },
    [models, handleReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  const handlePreviewClick = async () => {
    setPreviewOpen(true);
    setPreviewData(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const results = await previewSyncAiModels();
      if (!isMountedRef.current) return;
      setPreviewData(results);
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current) setPreviewLoading(false);
    }
  };

  const handleSyncConfirm = () => {
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
  };

  const totalToAdd = previewData?.reduce((sum, r) => sum + (r.toAdd?.length ?? 0), 0) ?? 0;
  const hasPreviewErrors = previewData?.some((r) => r.error) ?? false;

  if (loading && models.length === 0) {
    return (
      <div>
        <h1 className="text-lg font-semibold">AI モデル管理</h1>
        <p className="mt-2 text-slate-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">AI モデル管理</h1>
        <button
          type="button"
          onClick={handlePreviewClick}
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
              {r.provider}: {r.error ?? `追加 ${r.upserted}`}
            </span>
          ))}
        </div>
      )}

      {/* 同期プレビューモーダル */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-preview-title"
        >
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded bg-slate-800 p-4 shadow-xl">
            <h2 id="sync-preview-title" className="text-lg font-semibold text-slate-200">
              同期プレビュー
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              以下のモデルが追加されます（既存モデルは上書きされません。Sonnet
              系は非アクティブで追加）。
            </p>
            {previewLoading ? (
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
                              {m.displayName}
                              {!m.isActive && (
                                <span className="ml-1 text-amber-400">(非アクティブ)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        !r.error && (
                          <p className="mt-1 text-sm text-slate-500">追加なし（既に登録済み）</p>
                        )
                      )}
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
                      type="button"
                      onClick={() => {
                        setPreviewOpen(false);
                        setPreviewData(null);
                      }}
                      className="rounded bg-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-500"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncConfirm}
                      className="rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-teal-100 hover:bg-teal-600 disabled:opacity-50"
                    >
                      同期実行（{totalToAdd} 件追加）
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-700">
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
              <tr
                key={m.id}
                draggable
                onDragStart={(e) => handleDragStart(e, m.id)}
                onDragOver={(e) => handleDragOver(e, m.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, m.id)}
                onDragEnd={handleDragEnd}
                className={`border-b border-slate-700/70 ${!m.isActive ? "opacity-60" : ""} ${
                  draggedId === m.id ? "opacity-50" : ""
                } ${dragOverId === m.id ? "bg-slate-700/50" : ""}`}
              >
                <td className="cursor-grab px-1 py-2 text-slate-500 active:cursor-grabbing">⋮⋮</td>
                <td className="px-3 py-2 text-slate-300">{m.provider}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{m.modelId}</td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={m.displayName}
                    onChange={(e) =>
                      setModels((prev) =>
                        prev.map((x) =>
                          x.id === m.id ? { ...x, displayName: e.target.value } : x,
                        ),
                      )
                    }
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const originalModel = originalModelsRef.current.find((om) => om.id === m.id);
                      if (originalModel && v !== originalModel.displayName) {
                        void handleModelUpdate(originalModel, { displayName: v });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full min-w-[120px] rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 focus:border-slate-500 focus:outline-none"
                    aria-label={`${m.modelId} の表示名`}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`${m.displayName} のティア`}
                    value={m.tierRequired}
                    onChange={(e) => handleTierChange(m, e.target.value as "free" | "pro")}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
                  >
                    <option value="free">FREE</option>
                    <option value="pro">PRO</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(m)}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      m.isActive ? "bg-teal-900/50 text-teal-200" : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {m.isActive ? "ON" : "OFF"}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-400">{m.sortOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {models.length} 件（有効: {models.filter((m) => m.isActive).length}） ドラッグで並び替え
      </p>
    </div>
  );
}
