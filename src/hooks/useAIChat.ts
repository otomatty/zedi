import { useState, useCallback, useRef } from "react";
import { ChatMessage, PageContext, ReferencedPage } from "../types/aiChat";
import { callAIService, AIServiceRequest } from "../lib/aiService";
import { loadAISettings } from "../lib/aiSettings";
import { buildSystemPrompt } from "../lib/aiChatPrompt";
import { parseActions } from "../lib/aiChatActions";
import { useAIChatStore } from "../stores/aiChatStore";

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
      setError(null);

      // ユーザーメッセージを追加
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        referencedPages: messageRefs.length > 0 ? messageRefs : undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // AI応答メッセージのプレースホルダー
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // ストリーミング開始
      setStreaming(true);
      streamingContentRef.current = "";
      abortControllerRef.current = new AbortController();

      try {
        const settings = await loadAISettings();
        if (!settings) {
          throw new Error("AI settings not configured");
        }

        // ストアで選択されたモデルがあればそちらを優先
        const { selectedModel } = useAIChatStore.getState();
        const effectiveProvider = selectedModel?.provider ?? settings.provider;
        const effectiveModel = selectedModel?.model ?? settings.model;
        const effectiveModelId = selectedModel?.id ?? settings.modelId;
        const modelDisplayName = selectedModel?.displayName ?? effectiveModel;

        const context = contextEnabled ? pageContext : null;
        // Collect all referenced pages from this message and conversation history
        const allRefsInConversation = [...messages, userMessage].flatMap(
          (m) => m.referencedPages ?? [],
        );
        // Deduplicate by id
        const uniqueRefs = allRefsInConversation.filter(
          (ref, idx, arr) => arr.findIndex((r) => r.id === ref.id) === idx,
        );
        const systemPrompt = buildSystemPrompt(context, existingPageTitles, uniqueRefs);

        // 会話履歴からメッセージを構築
        const allMessages = [...messages, userMessage];
        const apiMessages: AIServiceRequest["messages"] = [
          { role: "system", content: systemPrompt },
          ...allMessages.map((m) => ({ role: m.role, content: m.content })),
        ];

        const request: AIServiceRequest = {
          provider: effectiveProvider,
          model: effectiveModel,
          messages: apiMessages,
          options: {
            stream: true,
            feature: "chat",
          },
        };

        // 使用するモデル情報でsettingsを上書き（callAIServiceに渡すため）
        const effectiveSettings: typeof settings = {
          ...settings,
          provider: effectiveProvider,
          model: effectiveModel,
          modelId: effectiveModelId,
        };

        await callAIService(
          effectiveSettings,
          request,
          {
            onChunk: (chunk) => {
              streamingContentRef.current += chunk;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: streamingContentRef.current } : m,
                ),
              );
            },
            onComplete: (response) => {
              const finalContent = response.content || streamingContentRef.current;
              const actions = parseActions(finalContent);

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: finalContent,
                        isStreaming: false,
                        modelDisplayName,
                        actions: actions.length > 0 ? actions : undefined,
                      }
                    : m,
                ),
              );
              setStreaming(false);
            },
            onError: (err) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: streamingContentRef.current || "",
                        isStreaming: false,
                        error: err.message,
                      }
                    : m,
                ),
              );
              setStreaming(false);
              setError(err.message);
            },
          },
          abortControllerRef.current.signal,
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: streamingContentRef.current || "",
                  isStreaming: false,
                  error: errorMessage,
                }
              : m,
          ),
        );
        setStreaming(false);
        setError(errorMessage);
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
    // 最後のユーザーメッセージを探して再送信
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      // エラーのAI応答を削除
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
