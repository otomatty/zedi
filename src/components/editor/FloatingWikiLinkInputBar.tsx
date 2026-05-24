import React from "react";
import { cn, useIsMobile } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { useVirtualKeyboardOffset } from "@/hooks/useVirtualKeyboardOffset";
import { WikiLinkInputBar, type WikiLinkInputBarProps } from "./WikiLinkInputBar";

/** 画面下部固定バーの下余白（モバイルのボトムナビ・safe-area 込み）。 / Bottom inset for the fixed bar on mobile. */
export const FLOATING_WIKI_LINK_BAR_PADDING_BOTTOM =
  "calc(env(safe-area-inset-bottom) + var(--app-bottom-nav-height, 0px) + 0.5rem)";

/** デスクトップ向けの下余白。画面下端から少し浮かせる。 / Desktop bottom inset — lifts the bar above the viewport edge. */
export const FLOATING_WIKI_LINK_BAR_PADDING_BOTTOM_DESKTOP =
  "calc(env(safe-area-inset-bottom) + 1.5rem)";

export interface FloatingWikiLinkInputBarProps extends WikiLinkInputBarProps {
  /** 入力バー右隣に並べるアクション（例: PageActionHub FAB）。 / Trailing control beside the input bar. */
  trailingAction?: React.ReactNode;
}

/**
 * `WikiLinkInputBar` を `Container` 幅で画面下部に固定配置するラッパー。
 * エディター本文と同じ max-width / 横 padding に揃え、入力バーは FAB 以外の
 * 残り幅を自動的に埋める。`TiptapEditor` から呼び出してエディタ画面でのみ
 * マウントする（読み取り専用画面・公開閲覧では呼び出さない）。
 *
 * モバイル向けには `visualViewport` API を常時監視し、仮想キーボードが
 * 表示されている間だけ bottom インセットを動的に上乗せして、入力バーと
 * 候補リストが常にキーボード上に見える状態を保つ（issue #927）。FAB クリック
 * 時に input の blur で一瞬下端へ戻る問題を避けるため、追従条件を input
 * focus ではなく viewport 上のキーボード有無に合わせる。デスクトップでは
 * 追従しない。
 *
 * Fixed-position wrapper that mounts {@link WikiLinkInputBar} at the bottom
 * inside {@link Container}, matching the editor column width. The input grows
 * to fill the row while the trailing action keeps its fixed size. `TiptapEditor`
 * decides when to mount the wrapper so the bar appears only on the editor
 * screen (read-only / public views skip it).
 *
 * For mobile (issue #927), the wrapper always tracks `visualViewport` and
 * adds the keyboard-covered area as a `bottom` offset while the on-screen
 * keyboard is visible. Tracking is keyed off the viewport inset — not input
 * focus — so tapping the adjacent FAB does not briefly snap the bar back to
 * the resting position before the keyboard finishes closing. Desktop skips
 * keyboard tracking entirely.
 */
export const FloatingWikiLinkInputBar: React.FC<FloatingWikiLinkInputBarProps> = ({
  trailingAction,
  ...props
}) => {
  const isMobile = useIsMobile();
  const keyboardOffset = useVirtualKeyboardOffset(isMobile);

  // キーボードが出ているときは下部ナビ・safe-area の余白は無効化する
  // （キーボードに既に隠れているため）。0.5rem だけ視覚的なすき間を確保。
  // When the keyboard is up the bottom-nav and safe-area paddings are
  // hidden behind the keyboard anyway, so collapse them to a single 0.5rem
  // gap to keep the bar visually pinned to the keyboard top edge.
  const isKeyboardOpen = isMobile && keyboardOffset > 0;
  const bottomStyle = isKeyboardOpen ? `${keyboardOffset}px` : undefined;

  return (
    <div
      data-testid="floating-wiki-link-input-bar"
      className={cn(
        "pointer-events-none fixed right-0 bottom-0 left-0 z-40",
        !isKeyboardOpen && "pb-[var(--floating-bar-pb)] md:pb-[var(--floating-bar-pb-md)]",
      )}
      style={
        {
          bottom: bottomStyle,
          "--floating-bar-pb": FLOATING_WIKI_LINK_BAR_PADDING_BOTTOM,
          "--floating-bar-pb-md": FLOATING_WIKI_LINK_BAR_PADDING_BOTTOM_DESKTOP,
          ...(isKeyboardOpen ? { paddingBottom: "0.5rem" } : {}),
        } as React.CSSProperties
      }
    >
      <Container className="pointer-events-auto flex items-end gap-2">
        <WikiLinkInputBar {...props} fillWidth className="min-w-0 flex-1" />
        {trailingAction}
      </Container>
    </div>
  );
};

export default FloatingWikiLinkInputBar;
