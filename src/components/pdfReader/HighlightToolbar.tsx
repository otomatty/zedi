/**
 * テキスト選択中に浮かぶフローティングツールバー。
 *
 * Floating toolbar that appears over the current text selection inside the
 * PDF viewer. Hosts three actions:
 *   - `[ハイライト保存 / Save highlight]`
 *   - `[保存して新規ページ / Save & derive page]`
 *   - `[キャンセル / Cancel]`
 *
 * 位置決め / Positioning:
 *  - 親が選択範囲の `getBoundingClientRect()` を **PdfReader のスクロールコンテナ**
 *    の `getBoundingClientRect()` で相対化した DOMRect を渡してくる。
 *  - The parent passes a viewer-relative bounding rect; we render the toolbar
 *    just above that rect, clamped to stay within the scroll container.
 */
import { useLayoutEffect, useRef, useState } from "react";

/** Props for {@link HighlightToolbar}. */
export interface HighlightToolbarProps {
  /**
   * 選択範囲のビューア相対 `DOMRect`。null のときはツールバー非表示。
   * Viewer-relative bounding rect of the current selection. When `null`, the
   * component renders nothing.
   */
  selectionRect: DOMRect | null;
  /** Saves the highlight (default colour: yellow). */
  onSave: () => void | Promise<void>;
  /** Saves the highlight and derives a Zedi page. */
  onSaveAndDerive: () => void | Promise<void>;
  /** Dismisses the toolbar without saving. */
  onCancel: () => void;
  /** When true, all actions are disabled (a save is in flight). */
  isSaving?: boolean;
}

const TOOLBAR_GAP_PX = 8;

/**
 * Floating toolbar component.
 */
export function HighlightToolbar({
  selectionRect,
  onSave,
  onSaveAndDerive,
  onCancel,
  isSaving = false,
}: HighlightToolbarProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!selectionRect || !ref.current) return;
    const toolbar = ref.current.getBoundingClientRect();
    // Place the toolbar above the selection by default; flip below if there
    // isn't enough room.
    const above = selectionRect.top - toolbar.height - TOOLBAR_GAP_PX;
    const top = above < 0 ? selectionRect.bottom + TOOLBAR_GAP_PX : above;
    const left = Math.max(0, selectionRect.left + selectionRect.width / 2 - toolbar.width / 2);
    setPosition({ top, left });
  }, [selectionRect]);

  if (!selectionRect) return null;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="ハイライト操作 / Highlight actions"
      data-testid="pdf-highlight-toolbar"
      className="bg-popover text-popover-foreground absolute z-50 flex items-center gap-1 rounded-md border p-1 shadow-md"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={isSaving}
        className="hover:bg-accent rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
      >
        {isSaving ? "…" : "ハイライト保存 / Save"}
      </button>
      <button
        type="button"
        onClick={() => void onSaveAndDerive()}
        disabled={isSaving}
        className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {isSaving ? "…" : "保存して新規ページ / Save & page"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={isSaving}
        className="hover:bg-accent text-muted-foreground rounded px-2 py-1 text-xs disabled:opacity-50"
      >
        キャンセル / Cancel
      </button>
    </div>
  );
}
