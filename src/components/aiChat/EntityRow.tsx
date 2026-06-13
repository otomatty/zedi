/**
 * Selectable entity row for PromoteToWikiDialog.
 * PromoteToWikiDialog 用のエンティティ選択行コンポーネント。
 */
import { Check } from "lucide-react";
import type { ExtractedEntity } from "@/lib/aiChat/extractEntitiesPrompt";

/**
 * Renders a selectable entity row.
 * エンティティ選択行を描画する。
 */
export function EntityRow({
  entity,
  index,
  isSelected,
  onToggle,
}: {
  entity: ExtractedEntity;
  index: number;
  isSelected: boolean;
  onToggle: (i: number) => void;
}) {
  return (
    <button
      type="button"
      className={`border-border hover:bg-muted w-full rounded-md border p-3 text-left transition-colors ${
        isSelected ? "bg-muted border-primary" : ""
      }`}
      onClick={() => onToggle(index)}
    >
      <div className="flex items-start gap-2">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground"
          }`}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{entity.title}</p>
          <p className="text-muted-foreground text-xs">{entity.summary}</p>
          {entity.isNew && (
            <span className="bg-primary/10 text-primary mt-1 inline-block rounded-full px-2 py-0.5 text-[10px]">
              New
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
