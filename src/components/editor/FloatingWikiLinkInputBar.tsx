import React from "react";
import { WikiLinkInputBar, type WikiLinkInputBarProps } from "./WikiLinkInputBar";

/**
 * `WikiLinkInputBar` を `ContentWithAIChat` の FAB スタックの左にレイアウト
 * する固定配置コンテナ。`TiptapEditor` から呼び出してエディタ画面でのみ
 * マウントする（読み取り専用画面・公開閲覧では呼び出さない）。
 *
 * Fixed-position wrapper that mounts {@link WikiLinkInputBar} just to the
 * left of the FAB stack rendered by `ContentWithAIChat`. `TiptapEditor`
 * decides when to mount the wrapper so the bar appears only on the editor
 * screen (read-only / public views skip it).
 */
export const FloatingWikiLinkInputBar: React.FC<WikiLinkInputBarProps> = (props) => {
  return (
    <div
      className="pointer-events-none fixed bottom-0 z-40 flex items-end p-2 pb-[env(safe-area-inset-bottom)]"
      style={{
        // FAB は約 64px 幅 + p-2 + safe-area-inset-right を取るため、バーを
        // FAB の左隣にレイアウトするには 5rem 程度のオフセットが必要。
        // ボトムナビ高さ (`--app-bottom-nav-height`) はモバイルでのみ非ゼロ。
        // FAB occupies ~64px plus padding/safe-area. Offset the bar by
        // ~5rem so it lands immediately to the left. The bottom-nav
        // variable only contributes on mobile builds that mount it.
        right: "calc(5rem + env(safe-area-inset-right))",
        paddingBottom:
          "calc(env(safe-area-inset-bottom) + var(--app-bottom-nav-height, 0px) + 0.5rem)",
      }}
    >
      <WikiLinkInputBar {...props} />
    </div>
  );
};

export default FloatingWikiLinkInputBar;
