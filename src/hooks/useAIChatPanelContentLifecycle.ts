import { useEffect, useRef } from "react";
import type { ChatMessage, Conversation, MessageMap, PageContext } from "@/types/aiChat";
import type { ConversationTreeUpdate } from "@/hooks/useAIChatConversations";

type UseAIChatPanelContentLifecycleParams = {
  pageContext: PageContext | null;
  setActiveConversation: (id: string | null) => void;
  clearMessages: () => void;
  activeConversationId: string | null;
  activeConversation: Conversation | undefined;
  loadConversation: (c: Conversation) => void;
  messages: ChatMessage[];
  updateConversation: (id: string, tree: ConversationTreeUpdate) => void;
  messageMap: MessageMap;
  rootMessageId: string | null;
  activeLeafId: string | null;
};

/**
 * Side effects for panel content: page switch reset, conversation load, and tree persistence.
 * パネル内容の副作用：ページ切替リセット、会話読込、ツリー永続化。
 */
export function useAIChatPanelContentLifecycle({
  pageContext,
  setActiveConversation,
  clearMessages,
  activeConversationId,
  activeConversation,
  loadConversation,
  messages,
  updateConversation,
  messageMap,
  rootMessageId,
  activeLeafId,
}: UseAIChatPanelContentLifecycleParams): void {
  const prevLoadedConversationIdRef = useRef<string | null>(null);

  const prevPageKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentKey = pageContext?.pageId ?? pageContext?.type ?? undefined;
    if (prevPageKeyRef.current !== undefined && currentKey !== prevPageKeyRef.current) {
      setActiveConversation(null);
      clearMessages();
    }
    prevPageKeyRef.current = currentKey;
  }, [pageContext?.pageId, pageContext?.type, setActiveConversation, clearMessages]);

  useEffect(() => {
    prevLoadedConversationIdRef.current = null;
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) {
      clearMessages();
      return;
    }
    const switchedConversation = prevLoadedConversationIdRef.current !== activeConversationId;
    if (!switchedConversation) {
      return;
    }
    if (activeConversation) {
      loadConversation(activeConversation);
      prevLoadedConversationIdRef.current = activeConversationId;
    } else {
      clearMessages();
    }
  }, [activeConversationId, activeConversation, loadConversation, clearMessages]);

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      updateConversation(activeConversationId, {
        messageMap,
        rootMessageId,
        activeLeafId,
      });
    }
  }, [messages, activeConversationId, updateConversation, messageMap, rootMessageId, activeLeafId]);
}
