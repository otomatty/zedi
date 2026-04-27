import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableCell,
  TableRow,
} from "@zedi/ui";
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

/**
 * AI モデル管理テーブルの 1 行（表示名・ティア・アクティブ・ドラッグ並べ替え）。
 * One editable row in the AI model management table.
 */
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
  const { t } = useTranslation();
  return (
    <TableRow
      draggable
      onDragStart={(e) => onDragStart(e, m.id)}
      onDragOver={(e) => onDragOver(e, m.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, m.id)}
      onDragEnd={onDragEnd}
      className={`border-border ${!m.isActive ? "opacity-60" : ""} ${
        draggedId === m.id ? "opacity-50" : ""
      } ${dragOverId === m.id ? "bg-muted/50" : ""}`}
    >
      <TableCell className="text-muted-foreground cursor-grab px-1 py-2 active:cursor-grabbing">
        ⋮⋮
      </TableCell>
      <TableCell className="px-3 py-2">{m.provider}</TableCell>
      <TableCell className="text-muted-foreground px-3 py-2 font-mono">{m.modelId}</TableCell>
      <TableCell className="px-3 py-2">
        <Input
          type="text"
          value={m.displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          onBlur={(e) => onDisplayNameBlur(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.currentTarget.blur();
            }
          }}
          className="h-8 min-w-[120px] text-sm"
          aria-label={t("aiModels.displayNameAriaLabel", { modelId: m.modelId })}
        />
      </TableCell>
      <TableCell className="px-3 py-2">
        <Select value={m.tierRequired} onValueChange={(v) => onTierChange(v as "free" | "pro")}>
          <SelectTrigger
            className="h-8 min-w-[100px]"
            aria-label={t("aiModels.tierAriaLabel", { name: m.displayName })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="free">FREE</SelectItem>
            <SelectItem value="pro">PRO</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="px-3 py-2">
        <Button
          type="button"
          variant={m.isActive ? "default" : "secondary"}
          size="sm"
          onClick={onToggleActive}
        >
          {m.isActive ? "ON" : "OFF"}
        </Button>
      </TableCell>
      <TableCell className="text-muted-foreground px-3 py-2">{m.sortOrder}</TableCell>
    </TableRow>
  );
}
