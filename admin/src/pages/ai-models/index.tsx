import { useEffect, useState } from "react";
import type { AiModelAdmin, SyncResultItem } from "@/api/admin";
import { getAiModels, patchAiModel, syncAiModels as syncAiModelsApi } from "@/api/admin";

export default function AiModels() {
  const [models, setModels] = useState<AiModelAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultItem[] | null>(null);

  const load = (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    getAiModels()
      .then(setModels)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    getAiModels()
      .then((nextModels) => {
        if (cancelled) return;
        setModels(nextModels);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleActive = async (m: AiModelAdmin) => {
    const next = !m.isActive;
    setModels((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: next } : x)));
    try {
      await patchAiModel(m.id, { isActive: next });
    } catch (e) {
      setModels((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: m.isActive } : x)));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTierChange = async (m: AiModelAdmin, tier: "free" | "pro") => {
    if (m.tierRequired === tier) return;
    const prev = m.tierRequired;
    setModels((prevModels) =>
      prevModels.map((x) => (x.id === m.id ? { ...x, tierRequired: tier } : x)),
    );
    try {
      await patchAiModel(m.id, { tierRequired: tier });
    } catch (e) {
      setModels((prevModels) =>
        prevModels.map((x) => (x.id === m.id ? { ...x, tierRequired: prev } : x)),
      );
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSync = () => {
    setSyncing(true);
    setSyncResult(null);
    syncAiModelsApi()
      .then((results) => {
        setSyncResult(results);
        load();
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
