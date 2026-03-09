import { useState, useCallback, useRef } from "react";
import { ChatMessage, PageContext, ReferencedPage } from "../types/aiChat";
import type { PageSummary } from "@/types/page";
import { useAIChatStore } from "../stores/aiChatStore";
import { resolveReferencedPagesFromContent } from "@/lib/aiChatActionHelpers";
import { executeSendMessage } from "./useAIChatExecute";

interface UseAIChatOptions {
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles?: string[];
  availablePages?: Pick<PageSummary, "id" | "title" | "isDeleted">[];
}

export function useAIChat({
  pageContext,
  contextEnabled,
  existingPageTitles = [],
  availablePages,
}: UseAIChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { setStreaming, isStreaming } = useAIChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>("");

  const sendMessage = useCallback(
    async (
      content: string,
      messageRefs: ReferencedPage[] = [],
      options?: { initialMessages?: ChatMessage[] },
    ) => {
      const baseMessages = options?.initialMessages ?? messages;
      try {
        await executeSendMessage({
          content,
          messageRefs,
          currentMessages: baseMessages,
          initialMessages: options?.initialMessages,
          pageContext,
          contextEnabled,
          existingPageTitles,
          setMessages,
          setError,
          setStreaming,
          streamingContentRef,
          abortControllerRef,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setStreaming(false);
      }
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
      sendMessage(lastUserMsg.content, lastUserMsg.referencedPages ?? []);
    }
  }, [messages, sendMessage]);

  /** 指定したユーザーメッセージを編集して再送信。そのメッセージ以降を破棄し、新内容でAI応答を生成する */
  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index < 0) return;
      const message = messages[index];
      if (message.role !== "user") return;
      const refs =
        availablePages == null
          ? (message.referencedPages ?? [])
          : resolveReferencedPagesFromContent(newContent, availablePages);
      const truncated = messages.slice(0, index);
      await sendMessage(newContent, refs, { initialMessages: truncated });
    },
    [availablePages, messages, sendMessage],
  );

  return {
    messages,
    error,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
    retryLastMessage,
    editAndResend,
  };
}
