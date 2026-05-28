/** Wiki Link 入力バー（`h-12`）の高さ（px）。FAB と揃える。 / Input bar height in px (`h-12`, aligned with FAB). */
export const WIKI_LINK_INPUT_BAR_HEIGHT_PX = 48;

/** 入力バー下端と本文のすき間（px、`0.5rem`）。 / Gap between bar and body text in px (`0.5rem`). */
export const WIKI_LINK_INPUT_BAR_GAP_PX = 8;

/**
 * モバイルの固定 Wiki Link 入力バー分、エディター本文末尾に確保する
 * `padding-bottom`（px）。キーボード表示時は `visualViewport` 由来の
 * `keyboardOffset` も加算し、バーがキーボード上に持ち上がっても末尾行が
 * 隠れないようにする（issue #927 系のモバイル重なり）。
 *
 * Reserves bottom padding on the editor body so the last line stays above the
 * fixed Wiki Link bar on mobile. When the virtual keyboard is visible, adds
 * `keyboardOffset` from `visualViewport` so lifted bars do not cover the tail
 * of the document.
 */
export function computeEditorFloatingBarBottomInsetPx(options: {
  isMobile: boolean;
  hasFloatingBar: boolean;
  keyboardOffset: number;
}): number {
  const { isMobile, hasFloatingBar, keyboardOffset } = options;
  if (!isMobile || !hasFloatingBar) return 0;
  return keyboardOffset + WIKI_LINK_INPUT_BAR_HEIGHT_PX + WIKI_LINK_INPUT_BAR_GAP_PX;
}
