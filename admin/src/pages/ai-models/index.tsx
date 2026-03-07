import { useCallback, useEffect, useRef, useState } from "react";
import type { AiModelAdmin, SyncResultItem } from "@/api/admin";
import { getAiModels, patchAiModel, syncAiModels as syncAiModelsApi } from "@/api/admin";

export default function AiModels() {
  const [models, setModels] = useState<AiModelAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultItem[] | null>(null);
  const isMountedRef = useRef(true);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading && isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);
    try {
      const nextModels = await getAiModels();
      if (!isMountedRef.current) return;
      setModels(nextModels);
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

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  const handleSync = () => {
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
          onClick={handleSync}
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
              {r.provider}: {r.error ?? `upsert ${r.upserted}`}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded border border-slate-700">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
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
                className={`border-b border-slate-700/70 ${!m.isActive ? "opacity-60" : ""}`}
              >
                <td className="px-3 py-2 text-slate-300">{m.provider}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{m.modelId}</td>
                <td className="px-3 py-2 text-slate-200">{m.displayName}</td>
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
        {models.length} 件（有効: {models.filter((m) => m.isActive).length}）
      </p>
    </div>
  );
}
