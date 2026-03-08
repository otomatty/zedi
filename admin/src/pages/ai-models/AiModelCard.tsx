import type { AiModelAdmin } from "@/api/admin";

interface AiModelCardProps {
  model: AiModelAdmin;
  onDisplayNameChange: (value: string) => void;
  onDisplayNameBlur: (value: string) => void;
  onTierChange: (tier: "free" | "pro") => void;
  onToggleActive: () => void;
}

/**
 * モバイル用リスト表示（カード形式）。ドラッグ並び替えはなし。
 */
export function AiModelCard({
  model: m,
  onDisplayNameChange,
  onDisplayNameBlur,
  onTierChange,
  onToggleActive,
}: AiModelCardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-800/50 p-3 ${!m.isActive ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-400">
          {m.provider} / {m.modelId}
        </span>
        <span className="text-xs text-slate-500">#{m.sortOrder}</span>
      </div>
      <div className="mt-2">
        <input
          type="text"
          value={m.displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          onBlur={(e) => onDisplayNameBlur(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 focus:border-slate-500 focus:outline-none"
          aria-label={`${m.modelId} の表示名`}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label={`${m.displayName} のティア`}
          value={m.tierRequired}
          onChange={(e) => onTierChange(e.target.value as "free" | "pro")}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-200"
        >
          <option value="free">FREE</option>
          <option value="pro">PRO</option>
        </select>
        <button
          type="button"
          onClick={onToggleActive}
          className={`rounded px-2 py-1 text-xs font-medium ${
            m.isActive ? "bg-teal-900/50 text-teal-200" : "bg-slate-700 text-slate-400"
          }`}
        >
          {m.isActive ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
