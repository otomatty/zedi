import type React from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@zedi/ui";

/**
 * Per-paragraph line widths designed to mimic natural prose: each inner array represents a
 * paragraph, and its entries are Tailwind width classes for the lines within that paragraph.
 * 段落ごとの行幅。内側の配列が 1 段落を表し、その要素が段落内の各行の幅クラスに対応する。
 */
const PARAGRAPH_GROUPS: readonly (readonly string[])[] = [
  ["w-[92%]", "w-[88%]", "w-[60%]"],
  ["w-[95%]", "w-[78%]"],
  ["w-[90%]", "w-[85%]", "w-[70%]", "w-[40%]"],
] as const;

/**
 * Placeholder UI shown while the collaborative editor is initialising. Mirrors the real
 * editor's minimum height so the swap to live content does not cause layout shift.
 * コラボレーティブエディタの初期化中に表示するプレースホルダー。実エディタと同じ最小高さを
 * 確保し、コンテンツ表示への切替時にレイアウトシフトが起きないようにする。
 */
export function EditorSkeleton(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={t("editor.collaborationLoading")}
      data-testid="editor-skeleton"
      className="min-h-[calc(100vh-200px)] space-y-6 py-4"
    >
      {PARAGRAPH_GROUPS.map((lines, groupIndex) => (
        <div key={`paragraph-${groupIndex}`} className="space-y-3">
          {lines.map((widthClass, lineIndex) => (
            <Skeleton
              key={`line-${groupIndex}-${lineIndex}`}
              data-testid="editor-skeleton-line"
              className={`h-4 ${widthClass}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
