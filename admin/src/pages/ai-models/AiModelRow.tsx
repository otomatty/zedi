import type { AiModelAdmin } from "@/api/admin";

interface AiModelRowProps {
  model: AiModelAdmin;
  draggedId: string | null;
  dragOverId: string | null;
  onDisplayNameChange: (value: string) => void;
  onDisplayNameBlur: (value: string) => void;
  onTierChange: (tier: "free" | "pro") => void;
  onToggleActive: () => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, toId: string) => void;
  onDragEnd: () => void;
}

export function AiModelRow({
  model: m,
  draggedId,
  dragOverId,
  onDisplayNameChange,
  onDisplayNameBlur,
  onTierChange,
  onToggleActive,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AiModelRowProps) {
  return (
    <tr
      draggable
      onDragStart={(e) => onDragStart(e, m.id)}
      onDragOver={(e) => onDragOver(e, m.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, m.id)}
      onDragEnd={onDragEnd}
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
          onChange={(e) => onDisplayNameChange(e.target.value)}
          onBlur={(e) => onDisplayNameBlur(e.target.value.trim())}
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
          onChange={(e) => onTierChange(e.target.value as "free" | "pro")}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
        >
          <option value="free">FREE</option>
          <option value="pro">PRO</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onToggleActive}
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            m.isActive ? "bg-teal-900/50 text-teal-200" : "bg-slate-700 text-slate-400"
          }`}
        >
          {m.isActive ? "ON" : "OFF"}
        </button>
      </td>
      <td className="px-3 py-2 text-slate-400">{m.sortOrder}</td>
    </tr>
  );
}
