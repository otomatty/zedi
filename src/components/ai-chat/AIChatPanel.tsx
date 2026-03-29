import { useAIChatStore } from "../../stores/aiChatStore";
import { AIChatPanelContent } from "./AIChatPanelContent";

/**
 * Slide-in AI chat panel; renders nothing when closed.
 * スライドインする AI チャットパネル。閉じているときは何も描画しない。
 */
export function AIChatPanel() {
  const {
    isOpen,
    activeConversationId,
    setActiveConversation,
    contextEnabled,
    showConversationList,
  } = useAIChatStore();

  if (!isOpen) return null;

  return (
    <AIChatPanelContent
      activeConversationId={activeConversationId}
      setActiveConversation={setActiveConversation}
      contextEnabled={contextEnabled}
      showConversationList={showConversationList}
    />
  );
}
