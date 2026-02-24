import type { ChatMessage, PageContext, ReferencedPage } from "../types/aiChat";
import type { AISettings } from "../types/ai";
import { callAIService, type AIServiceRequest } from "../lib/aiService";
import { loadAISettings } from "../lib/aiSettings";
import { buildSystemPrompt } from "../lib/aiChatPrompt";
import { parseActions } from "../lib/aiChatActions";
import { useAIChatStore } from "../stores/aiChatStore";

function updateAssistantMessage(
  prev: ChatMessage[],
  assistantMessageId: string,
  patch: Partial<ChatMessage>,
): ChatMessage[] {
  return prev.map((m) => (m.id === assistantMessageId ? { ...m, ...patch } : m));
}

export interface ExecuteSendMessageParams {
  content: string;
  messageRefs: ReferencedPage[];
  currentMessages: ChatMessage[];
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles: string[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setError: (value: string | null) => void;
  setStreaming: (value: boolean) => void;
  streamingContentRef: React.MutableRefObject<string>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export async function executeSendMessage(params: ExecuteSendMessageParams): Promise<void> {
  const {
    content,
    messageRefs,
    currentMessages,
    pageContext,
    contextEnabled,
    existingPageTitles,
    setMessages,
    setError,
    setStreaming,
    streamingContentRef,
    abortControllerRef,
  } = params;

  setError(null);

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    referencedPages: messageRefs.length > 0 ? messageRefs : undefined,
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, userMessage]);

  const assistantMessageId = crypto.randomUUID();
  const assistantMessage: ChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    isStreaming: true,
  };
  setMessages((prev) => [...prev, assistantMessage]);

  setStreaming(true);
  streamingContentRef.current = "";
  abortControllerRef.current = new AbortController();

  const settings = await loadAISettings();
  if (!settings) {
    throw new Error("AI settings not configured");
  }

  const { selectedModel } = useAIChatStore.getState();
  const effectiveProvider = selectedModel?.provider ?? settings.provider;
  const effectiveModel = selectedModel?.model ?? settings.model;
  const effectiveModelId = selectedModel?.id ?? settings.modelId;
  const modelDisplayName = selectedModel?.displayName ?? effectiveModel;

  const context = contextEnabled ? pageContext : null;
  const allRefsInConversation = [...currentMessages, userMessage].flatMap(
    (m) => m.referencedPages ?? [],
  );
  const uniqueRefs = allRefsInConversation.filter(
    (ref, idx, arr) => arr.findIndex((r) => r.id === ref.id) === idx,
  );
  const systemPrompt = buildSystemPrompt(context, existingPageTitles, uniqueRefs);

  const allMessages = [...currentMessages, userMessage];
  const apiMessages: AIServiceRequest["messages"] = [
    { role: "system", content: systemPrompt },
    ...allMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const request: AIServiceRequest = {
    provider: effectiveProvider,
    model: effectiveModel,
    messages: apiMessages,
    options: { stream: true, feature: "chat" },
  };

  const effectiveSettings: AISettings = {
    ...settings,
    provider: effectiveProvider,
    model: effectiveModel,
    modelId: effectiveModelId,
  };

  try {
    await callAIService(
      effectiveSettings,
      request,
      {
        onChunk: (chunk) => {
          streamingContentRef.current += chunk;
          setMessages((prev) =>
            updateAssistantMessage(prev, assistantMessageId, {
              content: streamingContentRef.current,
            }),
          );
        },
        onComplete: (response) => {
          const finalContent = response.content || streamingContentRef.current;
          const actions = parseActions(finalContent);
          setMessages((prev) =>
            updateAssistantMessage(prev, assistantMessageId, {
              content: finalContent,
              isStreaming: false,
              modelDisplayName,
              actions: actions.length > 0 ? actions : undefined,
            }),
          );
          setStreaming(false);
        },
        onError: (err) => {
          setMessages((prev) =>
            updateAssistantMessage(prev, assistantMessageId, {
              content: streamingContentRef.current || "",
              isStreaming: false,
              error: err.message,
            }),
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
      updateAssistantMessage(prev, assistantMessageId, {
        content: streamingContentRef.current || "",
        isStreaming: false,
        error: errorMessage,
      }),
    );
    setStreaming(false);
    setError(errorMessage);
  }
}
