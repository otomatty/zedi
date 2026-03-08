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
}

export function ContentWithAIChat({ children, floatingAction }: ContentWithAIChatProps) {
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
        {floatingAction && <div className="fixed bottom-6 right-6 z-40">{floatingAction}</div>}
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
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto transition-all duration-300 ease-in-out">
          {children}
        </div>
        {floatingAction && <div className="absolute bottom-6 right-6 z-40">{floatingAction}</div>}
      </div>
      <div
        className={cn(
          "sticky top-0 h-[calc(100vh-4.5rem)] flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
          isOpen
            ? "w-[30%] min-w-[280px] max-w-[45%] border-l opacity-100"
            : "w-0 min-w-0 border-l-0 opacity-0",
        )}
      >
        <div className="h-full w-[30vw] min-w-[280px] max-w-[45vw]">
          <AIChatPanel />
        </div>
      </div>

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
