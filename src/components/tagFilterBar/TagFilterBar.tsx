import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Skeleton, cn } from "@zedi/ui";
import { X } from "lucide-react";
import type { SelectedTags, TagAggregationItem } from "@/types/tagFilter";
import { TagChip } from "./TagChip";

/**
 * {@link TagFilterBar} のプロパティ。
 * Props for {@link TagFilterBar}.
 */
export interface TagFilterBarProps {
  /**
   * `useNoteTagAggregation` から取得したタグ集計。サーバ順 (page_count DESC)
   * をそのまま表示する。
   * Tag aggregation from `useNoteTagAggregation`, already ordered by count.
   */
  items: TagAggregationItem[];
  /**
   * 「タグなし」ページ数。`> 0` のときに「タグなし」チップを表示する。
   * Untagged page count; the chip is rendered only when this is `> 0`.
   */
  noneCount: number;
  /** 現在のフィルタ状態 / Current filter selection. */
  selected: SelectedTags;
  /** 選択変更コールバック / Called when the user changes the selection. */
  onChange: (next: SelectedTags) => void;
  /** ローディング中フラグ。`true` のときはスケルトンを表示する。 */
  isLoading?: boolean;
  /** 追加クラス名 / Optional className for the outer container. */
  className?: string;
}

const SKELETON_COUNT = 6;

/**
 * `/notes/:noteId` のページ一覧上部に並ぶタグチップ列。
 *
 * - クリックで OR 追加 / 解除。
 * - 「タグなし」チップは他タグと排他選択 (どちらか一方のみ)。
 * - 1 件以上選択中のときは「すべてクリア」ボタンを表示する。
 *
 * Filter bar above the page list. Clicking a chip toggles the tag in the
 * OR list; the "untagged" chip is mutually exclusive with normal tags.
 * A clear-all button appears when any filter is active.
 */
export const TagFilterBar: React.FC<TagFilterBarProps> = ({
  items,
  noneCount,
  selected,
  onChange,
  isLoading,
  className,
}) => {
  const { t } = useTranslation();

  // 現在選択されているタグキーの Set を派生。チップ側の `selected` 判定で使う。
  // Derive a Set of currently-selected tag keys for fast per-chip lookup.
  const selectedSet = useMemo<Set<string>>(() => {
    if (selected.kind === "tags") return new Set(selected.tags);
    return new Set();
  }, [selected]);

  const isUntaggedSelected = selected.kind === "untagged-only";
  const hasActiveFilter = selected.kind !== "none-selected";

  const handleToggleTag = useCallback(
    (key: string) => {
      // 「タグなし」が選択されているときに通常タグをクリックしたら、untagged を
      // 解除して通常タグだけが選ばれている状態に切り替える (`__none__` は排他)。
      // Clicking a normal tag while "untagged-only" is active drops the
      // untagged filter and starts a fresh tag selection (`__none__` is
      // exclusive).
      if (isUntaggedSelected) {
        onChange({ kind: "tags", tags: [key] });
        return;
      }
      if (selectedSet.has(key)) {
        const next = Array.from(selectedSet).filter((t) => t !== key);
        onChange(next.length === 0 ? { kind: "none-selected" } : { kind: "tags", tags: next });
      } else {
        onChange({ kind: "tags", tags: [...selectedSet, key] });
      }
    },
    [isUntaggedSelected, onChange, selectedSet],
  );

  const handleToggleUntagged = useCallback(() => {
    if (isUntaggedSelected) {
      onChange({ kind: "none-selected" });
    } else {
      onChange({ kind: "untagged-only" });
    }
  }, [isUntaggedSelected, onChange]);

  const handleClear = useCallback(() => {
    onChange({ kind: "none-selected" });
  }, [onChange]);

  // 読み込み中はスケルトン
  if (isLoading) {
    return (
      <div
        className={cn("flex flex-wrap items-center gap-2", className)}
        aria-label={t("notes.filterBar.ariaLabel")}
        role="region"
      >
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <Skeleton key={`tag-skel-${i}`} className="h-7 w-20 rounded-full" />
        ))}
      </div>
    );
  }

  // タグも「タグなし」もゼロなら原則バーを隠すが、URL 由来でフィルタが
  // 既に効いている場合は「クリア」ボタンを残すために描画を続ける (PR #897
  // CodeRabbit minor)。これがないと選択タグが (削除・rename 等で) 集計から
  // 消えた瞬間にフィルタを解除する手段が無くなる。
  //
  // Hide the bar when there are no chips to render — unless a URL-driven
  // filter is still active. Keeping the bar mounted in that case preserves
  // the clear button so users can always recover from an active filter
  // whose tag no longer appears in the aggregation (PR #897 CodeRabbit minor).
  if (items.length === 0 && noneCount === 0 && !hasActiveFilter) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label={t("notes.filterBar.ariaLabel")}
      role="region"
    >
      {items.map((item) => (
        <TagChip
          key={item.nameLower}
          label={item.name}
          count={item.pageCount}
          variant={item.resolved ? "tag" : "ghost"}
          selected={selectedSet.has(item.nameLower)}
          onToggle={() => handleToggleTag(item.nameLower)}
        />
      ))}
      {noneCount > 0 && (
        <TagChip
          label={t("notes.filterBar.untaggedChip")}
          count={noneCount}
          variant="untagged"
          selected={isUntaggedSelected}
          onToggle={handleToggleUntagged}
        />
      )}
      {hasActiveFilter && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleClear}
          className="ml-1 h-7 gap-1 px-2 text-xs"
          aria-label={t("notes.filterBar.clearAriaLabel")}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t("notes.filterBar.clear")}
        </Button>
      )}
    </div>
  );
};

export default TagFilterBar;
