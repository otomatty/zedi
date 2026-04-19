import { Drawer, DrawerContent, cn } from "@zedi/ui";
import { useIsMobile } from "@zedi/ui/hooks/use-mobile";
import { AIChatPanel } from "@/components/ai-chat/AIChatPanel";
import { useAIChatStore } from "@/stores/aiChatStore";
import { useAIChatContext } from "@/contexts/AIChatContext";

/**
 * Global AI chat dock placed at the layout layer.
 * Reserves a fixed-width column on desktop while keeping the main content flexible.
 * レイアウト層に配置するAIチャットドック。デスクトップでは固定幅、メイン領域は可変。
 */
export function AIChatDock() {
  const isMobile = useIsMobile();
  const { isOpen, closePanel } = useAIChatStore();
  const { aiChatAvailable } = useAIChatContext();

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

  return (
    <>
      {/* Spacer so main content does not sit under the fixed panel */}
      <div
        aria-hidden
        className="flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: isOpen ? "var(--ai-chat-width)" : 0 }}
      />
      <aside
        className={cn(
          "fixed top-[var(--app-header-height)] right-0 z-10 overflow-hidden transition-all duration-300 ease-in-out",
          "h-[calc(100svh-var(--app-header-height))]",
          isOpen
            ? "w-[var(--ai-chat-width)] border-l opacity-100"
            : "pointer-events-none w-0 border-l-0 opacity-0",
        )}
      >
        <div className="h-full w-full">
          <AIChatPanel />
        </div>
      </aside>
    </>
  );
}
