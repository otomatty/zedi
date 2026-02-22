import { useState, useCallback, useRef } from 'react';
import { ChatMessage, ChatAction, Conversation, PageContext } from '../types/aiChat';
import { callAIService, AIServiceRequest } from '../lib/aiService';
import { loadAISettings } from '../lib/aiSettings';
import { buildSystemPrompt } from '../lib/aiChatPrompt';
import { parseActions } from '../lib/aiChatActions';
import { useAIChatStore } from '../stores/aiChatStore';

interface UseAIChatOptions {
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles?: string[];
}

export function useAIChat({ pageContext, contextEnabled, existingPageTitles = [] }: UseAIChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { setStreaming, isStreaming } = useAIChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>('');

  const sendMessage = useCallback(async (content: string) => {
    setError(null);

    // ユーザーメッセージを追加
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // AI応答メッセージのプレースホルダー
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // ストリーミング開始
    setStreaming(true);
    streamingContentRef.current = '';
    abortControllerRef.current = new AbortController();

    try {
      const settings = await loadAISettings();
      if (!settings) {
        throw new Error('AI settings not configured');
      }

      const context = contextEnabled ? pageContext : null;
      const systemPrompt = buildSystemPrompt(context, existingPageTitles);

      // 会話履歴からメッセージを構築
      const allMessages = [...messages, userMessage];
      const apiMessages: AIServiceRequest['messages'] = [
        { role: 'system', content: systemPrompt },
        ...allMessages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const request: AIServiceRequest = {
        provider: settings.provider,
        model: settings.model,
        messages: apiMessages,
        options: {
          stream: true,
          feature: 'chat',
        },
      };

      await callAIService(
        settings,
        request,
        {
          onChunk: (chunk) => {
            streamingContentRef.current += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: streamingContentRef.current }
                  : m
              )
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
                      actions: actions.length > 0 ? actions : undefined,
                    }
                  : m
              )
            );
            setStreaming(false);
          },
          onError: (err) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: streamingContentRef.current || '',
                      isStreaming: false,
                      error: err.message,
                    }
                  : m
              )
            );
            setStreaming(false);
            setError(err.message);
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: streamingContentRef.current || '',
                isStreaming: false,
                error: errorMessage,
              }
            : m
        )
      );
      setStreaming(false);
      setError(errorMessage);
    }
  }, [messages, pageContext, contextEnabled, existingPageTitles, setStreaming]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, isStreaming: false, content: streamingContentRef.current }
          : m
      )
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
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
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
