import React, { useEffect, useState, useCallback, useRef } from "react";
import { useIsMobile } from "@zedi/ui/hooks/use-mobile";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";
import { AIChatPanel } from "./AIChatPanel";
import { ZEDI_PAGE_MIME_TYPE } from "../../types/aiChat";
import { Drawer, DrawerContent } from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface ContentWithAIChatProps {
  children: React.ReactNode;
  floatingAction?: React.ReactNode;
  /**
   * Whether to render local AI panel within this component.
   * true: Page-local right panel / drawer (used in standalone layouts like PageEditor).
   * false: Use global layout-level dock (AppLayout).
   * このコンポーネント内でAIパネルを描画するかどうか。
   */
  useLocalPanel?: boolean;
}

/**
 * Layout wrapper that provides AI chat panel and optional FAB. Used by Home and Notes.
 * AIチャットパネルとオプションのFABを提供するレイアウト。Home・Notesで利用。
 */
export function ContentWithAIChat({
  children,
  floatingAction,
  useLocalPanel = false,
}: ContentWithAIChatProps) {
  const isMobile = useIsMobile();
  const { isOpen, togglePanel, openPanel } = useAIChatStore();
  const { setAIChatAvailable } = useAIChatContext();
  const { t } = useTranslation();
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [isHoveringHint, setIsHoveringHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // このコンポーネントがマウントされている間、AIチャットが利用可能であることを通知
  useEffect(() => {
    setAIChatAvailable(true);
    return () => setAIChatAvailable(false);
  }, [setAIChatAvailable]);

  // Detect page drag globally (for showing hint zone when panel is closed)
  useEffect(() => {
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
  }, []);

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
        {children}
        {floatingAction && (
          <div className="fixed bottom-0 right-0 z-40 flex flex-col items-end gap-1 p-2 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]">
            {floatingAction}
          </div>
        )}
        {useLocalPanel && (
          <Drawer
            open={isOpen}
            onOpenChange={(open) => {
              if (!open) togglePanel();
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
          className="fixed bottom-0 z-40 flex flex-col items-end gap-1 p-2 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]"
          style={{
            right: useLocalPanel ? 0 : isOpen ? "var(--ai-chat-width)" : 0,
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

      {/* Drop hint zone when panel is closed and user is dragging a page */}
      {!isOpen && isDraggingPage && (
        <div
          className={cn(
            "fixed bottom-0 right-0 top-0 z-50 flex w-16 items-center justify-center transition-all duration-200",
            isHoveringHint ? "w-24 bg-primary/20" : "bg-primary/5",
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
            className="writing-mode-vertical whitespace-nowrap text-xs font-medium text-primary"
            style={{ writingMode: "vertical-rl" }}
          >
            {t("aiChat.referencedPages.dragHint")}
          </div>
        </div>
      )}
    </div>
  );
}
