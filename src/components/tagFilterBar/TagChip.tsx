import React from "react";
import { cn } from "@zedi/ui";

/**
 * {@link TagChip} のバリアント。`tag` は通常の解決済みタグ、`ghost` は同名
 * ページがまだ存在しない (未解決) タグ、`untagged` は「タグなし」専用チップ。
 * バリアントによってボーダー / 文字色を少し変えるが、レイアウト自体は同じ。
 *
 * Visual variant: `tag` (resolved), `ghost` (no matching page yet), or
 * `untagged` (the dedicated "no tags" chip). Variants share the same layout
 * but tweak border / text color so users can tell them apart.
 */
export type TagChipVariant = "tag" | "ghost" | "untagged";

/**
 * 単一のフィルタチップ。`selected` を真にすると塗りつぶし、偽だとアウトライン。
 * クリックで `onToggle` を呼ぶ。バリアントは `tag` / `ghost` / `untagged`。
 *
 * Single filter chip. `selected = true` fills the chip; `false` is outlined.
 * Click invokes `onToggle`. Variants change subtle border / color cues.
 */
export interface TagChipProps {
  /** チップに表示する名前 (`#` プレフィックスはここでは付けない)。 */
  label: string;
  /** 使用ページ数。`undefined` のときは件数バッジを描画しない。 */
  count?: number;
  /** 選択中か否か / Whether the chip is currently selected. */
  selected: boolean;
  variant: TagChipVariant;
  /** 全体を無効化する (排他選択時に他チップを操作不能にする等)。 */
  disabled?: boolean;
  onToggle: () => void;
}

const variantStyles: Record<TagChipVariant, { selected: string; idle: string }> = {
  tag: {
    selected: "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
    idle: "bg-background text-foreground border-border hover:bg-muted",
  },
  ghost: {
    selected: "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
    idle: "bg-background text-muted-foreground border-dashed border-border hover:bg-muted hover:text-foreground",
  },
  untagged: {
    selected: "bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/80",
    idle: "bg-background text-muted-foreground border-dashed border-border italic hover:bg-muted hover:text-foreground",
  },
};

/**
 * 単一のフィルタチップ。{@link TagChipProps} 参照。
 * Single filter chip; see {@link TagChipProps}.
 */
export const TagChip: React.FC<TagChipProps> = ({
  label,
  count,
  selected,
  variant,
  disabled,
  onToggle,
}) => {
  const style = selected ? variantStyles[variant].selected : variantStyles[variant].idle;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        style,
      )}
    >
      <span className="max-w-[14ch] truncate" title={label}>
        {variant === "untagged" ? label : `#${label}`}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] tabular-nums",
            selected ? "bg-background/20" : "bg-muted/50",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default TagChip;
