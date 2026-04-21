import React, { useEffect, useState, useCallback, useRef } from "react";
import { useIsMobile } from "@zedi/ui/hooks/use-mobile";
import { useAIChatStore } from "../../stores/aiChatStore";
import { AIChatPanel } from "./AIChatPanel";
import { ZEDI_PAGE_MIME_TYPE } from "../../types/aiChat";
import { Drawer, DrawerContent } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface ContentWithAIChatProps {
  children: React.ReactNode;
  floatingAction?: React.ReactNode;
  /**
   * Whether to render a page-local AI chat panel within this component
   * (used by standalone layouts like PageEditor). When false, the wrapper
   * only supplies the flex layout for children and the floating action.
   * このコンポーネント内でページローカルなAIパネルを描画するかどうか。
   */
  useLocalPanel?: boolean;
}

/**
 * Layout wrapper that optionally renders a page-local AI chat panel and a FAB.
 * AIチャットパネル（ページローカル）とオプションのFABを提供するレイアウト。
 */
export function ContentWithAIChat({
  children,
  floatingAction,
  useLocalPanel = false,
}: ContentWithAIChatProps) {
  const isMobile = useIsMobile();
  const { isOpen, openPanel, closePanel } = useAIChatStore();
  const { t } = useTranslation();
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [isHoveringHint, setIsHoveringHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!useLocalPanel) return;
    const handleGlobalDragStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(ZEDI_PAGE_MIME_TYPE)) {
        setIsDraggingPage(true);
      }
    };
    const handleGlobalDragEnd = () => {
      setIsDraggingPage(false);
      setIsHoveringHint(false);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
    const handleGlobalDrop = () => {
      setIsDraggingPage(false);
      setIsHoveringHint(false);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
    document.addEventListener("dragstart", handleGlobalDragStart);
    document.addEventListener("dragend", handleGlobalDragEnd);
    document.addEventListener("drop", handleGlobalDrop);
    return () => {
      document.removeEventListener("dragstart", handleGlobalDragStart);
      document.removeEventListener("dragend", handleGlobalDragEnd);
      document.removeEventListener("drop", handleGlobalDrop);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [useLocalPanel]);

  const handleHintDragEnter = useCallback(() => {
    hintTimerRef.current = setTimeout(() => {
      openPanel();
      setIsDraggingPage(false);
      setIsHoveringHint(false);
    }, 800);
    setIsHoveringHint(true);
  }, [openPanel]);

  const handleHintDragLeave = useCallback(() => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setIsHoveringHint(false);
  }, []);

  if (isMobile) {
    return (
      <>
        {/* モバイル用スクロールコンテナ。PageEditorLayout が overflow-hidden の
            flex-col であるため、ここで overflow-y-auto を付けないと TipTap など
            の子コンテンツがクリップされ、タッチスクロールが効かなくなる。
            Mobile scroll container. PageEditorLayout is a flex-col with
            overflow-hidden, so without this wrapper child content (e.g. the
            TipTap editor) gets clipped and touch scrolling does not engage. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {floatingAction && (
          <div
            className="pointer-events-none fixed right-0 bottom-0 z-40 flex flex-col items-end gap-1 p-2 pr-[env(safe-area-inset-right)]"
            style={{
              // 親指リーチを確保し、かつボトムナビと重ならないよう safe-area +
              // ボトムナビ高さ分だけ下余白を空ける。ボトムナビ非表示時は 0px に戻る。
              // Offset the FAB above the bottom nav while respecting the
              // device safe area. Falls back to 0px when the bottom nav is
              // not mounted (desktop / pages without the nav).
              paddingBottom:
                "calc(env(safe-area-inset-bottom) + var(--app-bottom-nav-height, 0px) + 0.5rem)",
            }}
          >
            {floatingAction}
          </div>
        )}
        {useLocalPanel && (
          <Drawer
            open={isOpen}
            onOpenChange={(open) => {
              if (!open) closePanel();
            }}
          >
            <DrawerContent className="h-[85vh]">
              <AIChatPanel />
            </DrawerContent>
          </Drawer>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-y-auto transition-all duration-300 ease-in-out">
        {children}
      </div>
      {floatingAction && (
        <div
          className="pointer-events-none fixed bottom-0 z-40 flex flex-col items-end gap-1 p-2 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]"
          style={{
            right: useLocalPanel && isOpen ? "var(--ai-chat-width)" : 0,
          }}
        >
          {floatingAction}
        </div>
      )}
      {useLocalPanel && (
        <div
          className={cn(
            "h-full flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
            isOpen
              ? "w-[var(--ai-chat-width,22rem)] border-l opacity-100"
              : "w-0 border-l-0 opacity-0",
          )}
        >
          <div className="h-full w-full">
            <AIChatPanel />
          </div>
        </div>
      )}

      {/* Drop hint zone when a local panel is closed and user is dragging a page */}
      {useLocalPanel && !isOpen && isDraggingPage && (
        <div
          className={cn(
            "fixed top-0 right-0 bottom-0 z-50 flex w-16 items-center justify-center transition-all duration-200",
            isHoveringHint ? "bg-primary/20 w-24" : "bg-primary/5",
          )}
          onDragEnter={handleHintDragEnter}
          onDragLeave={handleHintDragLeave}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(ZEDI_PAGE_MIME_TYPE)) {
              e.preventDefault();
            }
          }}
        >
          <div
            className="writing-mode-vertical text-primary text-xs font-medium whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            {t("aiChat.referencedPages.dragHint")}
          </div>
        </div>
      )}
    </div>
  );
}
