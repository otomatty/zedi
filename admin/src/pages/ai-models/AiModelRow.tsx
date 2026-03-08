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
      <TableCell className="cursor-grab px-1 py-2 text-muted-foreground active:cursor-grabbing">
        ⋮⋮
      </TableCell>
      <TableCell className="px-3 py-2">{m.provider}</TableCell>
      <TableCell className="px-3 py-2 font-mono text-muted-foreground">{m.modelId}</TableCell>
      <TableCell className="px-3 py-2">
        <Input
          type="text"
          value={m.displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          onBlur={(e) => onDisplayNameBlur(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="h-8 min-w-[120px] text-sm"
          aria-label={`${m.modelId} の表示名`}
        />
      </TableCell>
      <TableCell className="px-3 py-2">
        <Select value={m.tierRequired} onValueChange={(v) => onTierChange(v as "free" | "pro")}>
          <SelectTrigger className="h-8 min-w-[100px]" aria-label={`${m.displayName} のティア`}>
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
      <TableCell className="px-3 py-2 text-muted-foreground">{m.sortOrder}</TableCell>
    </TableRow>
  );
}
