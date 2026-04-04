import { useCallback, useRef } from "react";
import { Drawer, DrawerContent, cn } from "@zedi/ui";
import { useIsMobile } from "@zedi/ui/hooks/use-mobile";
import { AIChatPanel } from "@/components/ai-chat/AIChatPanel";
import { useAIChatStore, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH } from "@/stores/aiChatStore";
import { useAIChatContext } from "@/contexts/AIChatContext";

/**
 * Global AI chat dock placed at the layout layer.
 * Keeps left/right sidebars fixed width while center content stays flexible.
 * レイアウト層に配置するAIチャットドック。左右を固定幅にし、中央のみ可変にする。
 */
export function AIChatDock() {
  const isMobile = useIsMobile();
  const { isOpen, closePanel, panelWidth, setPanelWidth } = useAIChatStore();
  const { aiChatAvailable } = useAIChatContext();
  const isDraggingRef = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;

      const onMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const onUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelWidth, setPanelWidth],
  );

  if (!aiChatAvailable) return null;

  if (isMobile) {
    return (
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
    );
  }

  const widthPx = `${panelWidth}px`;

  return (
    <>
      {/* Spacer so main content does not sit under the fixed panel */}
      <div
        aria-hidden
        className="flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: isOpen ? widthPx : 0 }}
      />
      <aside
        className={cn(
          "fixed top-[var(--app-header-height)] right-0 z-10 overflow-hidden transition-all duration-300 ease-in-out",
          "h-[calc(100svh-var(--app-header-height))]",
          isOpen ? "border-l opacity-100" : "pointer-events-none w-0 border-l-0 opacity-0",
        )}
        style={{ width: isOpen ? widthPx : 0 }}
      >
        {/* Resize handle */}
        {isOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="hover:bg-primary/20 active:bg-primary/30 absolute top-0 bottom-0 left-0 z-20 w-1 cursor-col-resize transition-colors"
            onMouseDown={handleResizeStart}
          />
        )}
        <div className="h-full w-full">
          <AIChatPanel />
        </div>
      </aside>
    </>
  );
}
