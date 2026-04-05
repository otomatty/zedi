import React, { useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { usePageStore } from "@/stores/pageStore";
import { WikiLinkPreviewContent } from "@/components/wiki-link/WikiLinkPreviewContent";
import { useWikiLinkHover } from "./useWikiLinkHover";

/**
 * エディタ内 WikiLink ホバーカードレイヤーの Props。
 * Props for the WikiLink hover card layer rendered over the editor.
 */
interface WikiLinkHoverCardLayerProps {
  /** Tiptap エディタインスタンス / Tiptap editor instance */
  editor: Editor | null;
  /** エディタコンテナの ref / Ref to the editor container element */
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  /** WikiLink クリック時のコールバック / Callback when a WikiLink is clicked */
  onLinkClick: (title: string) => void;
}

const CARD_WIDTH = 256;
const VIEWPORT_PADDING = 8;
const FLIP_THRESHOLD = 200;

/**
 * エディタ内の WikiLink ホバーカードレイヤー。
 * マウスホバーでページプレビューを表示し、モバイルでは長押しで表示する。
 * 入力中はカードを非表示にする。
 *
 * Renders a hover card preview for WikiLink marks in the editor DOM using
 * event delegation. Supports desktop hover and mobile long-press.
 * Suppressed during active typing.
 */
export const WikiLinkHoverCardLayer: React.FC<WikiLinkHoverCardLayerProps> = ({
  editor,
  editorContainerRef,
  onLinkClick,
}) => {
  const { target, isVisible, cardRef, closeCard, handleCardMouseEnter, handleCardMouseLeave } =
    useWikiLinkHover(editor, editorContainerRef);

  const page = usePageStore((state) => {
    if (!target) return undefined;
    return state.getPageByTitle(target.title);
  });

  const handleCardClick = useCallback(() => {
    if (!target) return;
    closeCard();
    onLinkClick(target.title);
  }, [target, onLinkClick, closeCard]);

  if (!isVisible || !target) return null;

  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(target.rect.left, window.innerWidth - CARD_WIDTH - VIEWPORT_PADDING),
  );
  const spaceBelow = window.innerHeight - target.rect.bottom;
  const flipAbove = spaceBelow < FLIP_THRESHOLD;

  const cardStyle: React.CSSProperties = {
    position: "fixed",
    left,
    top: flipAbove ? undefined : target.rect.bottom + 4,
    bottom: flipAbove ? window.innerHeight - target.rect.top + 4 : undefined,
    zIndex: 50,
  };

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      style={cardStyle}
      className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 w-64 rounded-md border p-4 shadow-md"
      onMouseEnter={handleCardMouseEnter}
      onMouseLeave={handleCardMouseLeave}
    >
      <WikiLinkPreviewContent
        title={target.title}
        page={page}
        exists={target.exists}
        referenced={target.referenced}
        onClick={handleCardClick}
      />
    </div>,
    document.body,
  );
};
