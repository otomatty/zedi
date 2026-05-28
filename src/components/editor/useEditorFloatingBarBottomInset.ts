import { useIsMobile } from "@zedi/ui";
import { useVirtualKeyboardOffset } from "@/hooks/useVirtualKeyboardOffset";
import { computeEditorFloatingBarBottomInsetPx } from "./editorFloatingBarInset";

/**
 * モバイル編集画面で固定 Wiki Link 入力バーと末尾行が重ならないよう、
 * エディター本文用の `padding-bottom`（px）を返す。
 *
 * Returns bottom padding (px) for the editor body on mobile so the fixed Wiki
 * Link bar does not cover the last editable line, including while the virtual
 * keyboard is visible.
 */
export function useEditorFloatingBarBottomInset(hasFloatingBar: boolean): number {
  const isMobile = useIsMobile();
  const keyboardOffset = useVirtualKeyboardOffset(isMobile && hasFloatingBar);
  return computeEditorFloatingBarBottomInsetPx({
    isMobile,
    hasFloatingBar,
    keyboardOffset,
  });
}
