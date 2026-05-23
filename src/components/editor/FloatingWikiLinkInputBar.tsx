import React, { useCallback, useState } from "react";
import { useVirtualKeyboardOffset } from "@/hooks/useVirtualKeyboardOffset";
import { WikiLinkInputBar, type WikiLinkInputBarProps } from "./WikiLinkInputBar";

/**
 * `WikiLinkInputBar` を `ContentWithAIChat` の FAB スタックの左にレイアウト
 * する固定配置コンテナ。`TiptapEditor` から呼び出してエディタ画面でのみ
 * マウントする（読み取り専用画面・公開閲覧では呼び出さない）。
 *
 * モバイル向けには `visualViewport` API を使い、入力欄が focus されている
 * 間だけキーボード分の bottom インセットを動的に上乗せして、入力バーと
 * 候補リストが常にキーボード上に見える状態を保つ（issue #927）。focus が
 * 外れたタイミングでリスナーは解除され、通常配置に戻る。
 *
 * Fixed-position wrapper that mounts {@link WikiLinkInputBar} just to the
 * left of the FAB stack rendered by `ContentWithAIChat`. `TiptapEditor`
 * decides when to mount the wrapper so the bar appears only on the editor
 * screen (read-only / public views skip it).
 *
 * For mobile (issue #927), while the input is focused the wrapper tracks
 * `visualViewport` and adds the keyboard-covered area as a `bottom` offset
 * so both the input bar and its suggestion popup stay visible above the
 * on-screen keyboard. Listeners are detached on blur and the bar returns to
 * its default position.
 */
export const FloatingWikiLinkInputBar: React.FC<WikiLinkInputBarProps> = (props) => {
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const keyboardOffset = useVirtualKeyboardOffset(isFocusWithin);

  const handleFocusCapture = useCallback(() => {
    setIsFocusWithin(true);
  }, []);
  const handleBlurCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    // フォーカスがバー内の別要素（候補リスト等）へ移っただけなら focus 状態を
    // 維持する。バーの外に出た場合のみキーボード追従を停止する。
    // Stay focused while focus moves between bar internals (input ↔ suggestion
    // list). Only clear the flag when focus leaves the wrapper entirely so we
    // don't tear down the visualViewport listener mid-interaction.
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsFocusWithin(false);
  }, []);

  // キーボードが出ているときは下部ナビ・safe-area の余白は無効化する
  // （キーボードに既に隠れているため）。0.5rem だけ視覚的なすき間を確保。
  // When the keyboard is up the bottom-nav and safe-area paddings are
  // hidden behind the keyboard anyway, so collapse them to a single 0.5rem
  // gap to keep the bar visually pinned to the keyboard top edge.
  const isKeyboardOpen = keyboardOffset > 0;
  const bottomStyle = isKeyboardOpen ? `${keyboardOffset}px` : undefined;
  const paddingBottomStyle = isKeyboardOpen
    ? "0.5rem"
    : "calc(env(safe-area-inset-bottom) + var(--app-bottom-nav-height, 0px) + 0.5rem)";

  return (
    <div
      data-testid="floating-wiki-link-input-bar"
      className="pointer-events-none fixed bottom-0 z-40 flex items-end p-2 pb-[env(safe-area-inset-bottom)]"
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      style={{
        // FAB は約 64px 幅 + p-2 + safe-area-inset-right を取るため、バーを
        // FAB の左隣にレイアウトするには 5rem 程度のオフセットが必要。
        // ボトムナビ高さ (`--app-bottom-nav-height`) はモバイルでのみ非ゼロ。
        // FAB occupies ~64px plus padding/safe-area. Offset the bar by
        // ~5rem so it lands immediately to the left. The bottom-nav
        // variable only contributes on mobile builds that mount it.
        right: "calc(5rem + env(safe-area-inset-right))",
        bottom: bottomStyle,
        paddingBottom: paddingBottomStyle,
      }}
    >
      <WikiLinkInputBar {...props} />
    </div>
  );
};

export default FloatingWikiLinkInputBar;
