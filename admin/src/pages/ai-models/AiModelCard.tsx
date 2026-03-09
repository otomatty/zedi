import {
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@zedi/ui";
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
    <Card className={!m.isActive ? "opacity-60" : ""}>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-slate-400">
            {m.provider} / {m.modelId}
          </span>
          <span className="text-xs text-slate-500">#{m.sortOrder}</span>
        </div>
        <div className="mt-2">
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
            className="h-8 text-sm"
            aria-label={`${m.modelId} の表示名`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={m.tierRequired}
            onValueChange={(v) => {
              if (v === "free" || v === "pro") onTierChange(v);
            }}
          >
            <SelectTrigger className="h-8 w-[100px]" aria-label={`${m.displayName} のティア`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">FREE</SelectItem>
              <SelectItem value="pro">PRO</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={m.isActive ? "default" : "secondary"}
            size="sm"
            onClick={onToggleActive}
          >
            {m.isActive ? "ON" : "OFF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
