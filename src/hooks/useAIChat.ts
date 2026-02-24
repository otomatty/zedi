import { useState, useCallback, useRef } from "react";
import { ChatMessage, PageContext, ReferencedPage } from "../types/aiChat";
import { useAIChatStore } from "../stores/aiChatStore";
import { executeSendMessage } from "./useAIChatExecute";

interface UseAIChatOptions {
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles?: string[];
}

export function useAIChat({
  pageContext,
  contextEnabled,
  existingPageTitles = [],
}: UseAIChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { setStreaming, isStreaming } = useAIChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>("");

  const sendMessage = useCallback(
    async (content: string, messageRefs: ReferencedPage[] = []) => {
      await executeSendMessage({
        content,
        messageRefs,
        currentMessages: messages,
        pageContext,
        contextEnabled,
        existingPageTitles,
        setMessages,
        setError,
        setStreaming,
        streamingContentRef,
        abortControllerRef,
      });
    },
    [messages, pageContext, contextEnabled, existingPageTitles, setStreaming],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false, content: streamingContentRef.current } : m,
      ),
    );
  }, [setStreaming]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const loadMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  const retryLastMessage = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => prev.filter((m) => !m.error));
      sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    error,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
    retryLastMessage,
  };
}
