import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatMessage, ChatTreeState, ReferencedPage } from "../types/aiChat";
import type { AISettings } from "../types/ai";
import { callAIService, type AIServiceRequest } from "../lib/aiService";
import { parseActions } from "../lib/aiChatActions";
import { useAIChatStore } from "../stores/aiChatStore";
import { patchMessageInTree } from "../lib/messageTree";

/**
 * Builds the `messages` array for the AI API from the active path and optional user tail.
 * アクティブパスと任意のユーザーメッセージ末尾から API 用 `messages` を組み立てる。
 */
export function buildApiPayload(
  basePath: ChatMessage[],
  userMessage: ChatMessage | null,
): AIServiceRequest["messages"] {
  const tail = userMessage ? [userMessage] : [];
  return [...basePath, ...tail].map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Deduplicates referenced pages by `id` (stable first occurrence).
 * `id` で参照ページを重複除去（先勝ち）。
 */
export function dedupeReferencedPagesById(refs: ReferencedPage[]): ReferencedPage[] {
  return refs.filter((ref, idx, arr) => arr.findIndex((r) => r.id === ref.id) === idx);
}

/**
 * Collects `referencedPages` from a list of chat messages and dedupes by page id.
 * メッセージ列から参照ページを集約し、ページ id で重複除去する。
 */
export function collectReferencedPagesFromMessages(messages: ChatMessage[]): ReferencedPage[] {
  return dedupeReferencedPagesById(messages.flatMap((m) => m.referencedPages ?? []));
}

/**
 * Resolves provider/model from the global store overlaying persisted settings.
 * 永続設定にストア選択モデルを上書きして実効のプロバイダ／モデルを決める。
 */
export function resolveEffectiveAIModel(settings: AISettings): {
  effectiveSettings: AISettings;
  modelDisplayName: string;
} {
  const { selectedModel } = useAIChatStore.getState();
  const effectiveProvider = selectedModel?.provider ?? settings.provider;
  const effectiveModel = selectedModel?.model ?? settings.model;
  const effectiveModelId = selectedModel?.id ?? settings.modelId;
  const modelDisplayName = selectedModel?.displayName ?? effectiveModel;
  return {
    effectiveSettings: {
      ...settings,
      provider: effectiveProvider,
      model: effectiveModel,
      modelId: effectiveModelId,
    },
    modelDisplayName,
  };
}

/**
 * Patches an assistant node when settings cannot be loaded before streaming starts.
 * ストリーミング前に設定が読めないとき、アシスタントノードへエラーを付与する。
 */
export function patchAssistantSettingsLoadFailure(
  setTree: Dispatch<SetStateAction<ChatTreeState>>,
  assistantMessageId: string,
  errorMessage: string,
  setStreaming: (value: boolean) => void,
  setError: (value: string | null) => void,
): void {
  setTree((prev) => ({
    ...prev,
    messageMap: patchMessageInTree(prev.messageMap, assistantMessageId, {
      content: "",
      isStreaming: false,
      error: errorMessage,
    }),
  }));
  setStreaming(false);
  setError(errorMessage);
}

/**
 * Dependencies for {@link streamAssistantCompletion} (tree + UI refs).
 * {@link streamAssistantCompletion} に渡す依存（ツリーと UI ref）。
 */
export type StreamAssistantCompletionDeps = {
  assistantMessageId: string;
  modelDisplayName: string;
  streamingContentRef: MutableRefObject<string>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  setStreaming: (value: boolean) => void;
  setError: (value: string | null) => void;
};

/**
 * Calls the AI service with streaming callbacks that update the assistant message in the tree.
 * ストリーミングコールバックでツリー上のアシスタントを更新しながら AI を呼ぶ。
 */
export async function streamAssistantCompletion(
  effectiveSettings: AISettings,
  request: AIServiceRequest,
  signal: AbortSignal,
  deps: StreamAssistantCompletionDeps,
): Promise<void> {
  const {
    assistantMessageId,
    modelDisplayName,
    streamingContentRef,
    setTree,
    setStreaming,
    setError,
  } = deps;

  try {
    await callAIService(
      effectiveSettings,
      request,
      {
        onChunk: (chunk) => {
          streamingContentRef.current += chunk;
          setTree((prev) => ({
            ...prev,
            messageMap: patchMessageInTree(prev.messageMap, assistantMessageId, {
              content: streamingContentRef.current,
            }),
          }));
        },
        onComplete: (response) => {
          const finalContent = response.content || streamingContentRef.current;
          const actions = parseActions(finalContent);
          setTree((prev) => ({
            ...prev,
            messageMap: patchMessageInTree(prev.messageMap, assistantMessageId, {
              content: finalContent,
              isStreaming: false,
              modelDisplayName,
              actions: actions.length > 0 ? actions : undefined,
            }),
          }));
          setStreaming(false);
        },
        onError: (err) => {
          setTree((prev) => ({
            ...prev,
            messageMap: patchMessageInTree(prev.messageMap, assistantMessageId, {
              content: streamingContentRef.current || "",
              isStreaming: false,
              error: err.message,
            }),
          }));
          setStreaming(false);
          setError(err.message);
        },
      },
      signal,
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    setTree((prev) => ({
      ...prev,
      messageMap: patchMessageInTree(prev.messageMap, assistantMessageId, {
        content: streamingContentRef.current || "",
        isStreaming: false,
        error: errorMessage,
      }),
    }));
    setStreaming(false);
    setError(errorMessage);
  }
}
