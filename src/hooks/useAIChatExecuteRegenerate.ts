import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatTreeState, PageContext, TreeChatMessage } from "../types/aiChat";
import type { AIServiceRequest } from "../lib/aiService";
import { loadAISettings } from "../lib/aiSettings";
import { buildSystemPrompt } from "../lib/aiChatPrompt";
import { addMessageToTree, getActivePath, stripToChatMessage } from "../lib/messageTree";
import {
  buildApiPayload,
  collectReferencedPagesFromMessages,
  patchAssistantSettingsLoadFailure,
  resolveEffectiveAIModel,
  streamAssistantCompletion,
} from "./useAIChatExecuteHelpers";

/**
 * Parameters for {@link executeRegenerateAssistant}.
 * {@link executeRegenerateAssistant} に渡す引数。
 */
export interface ExecuteRegenerateAssistantParams {
  assistantMessageId: string;
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles: string[];
  setError: (value: string | null) => void;
  setStreaming: (value: boolean) => void;
  streamingContentRef: MutableRefObject<string>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  treeRef: MutableRefObject<ChatTreeState>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
}

/**
 * Adds a sibling assistant under the same user message and streams the new reply.
 * 同一ユーザーメッセージの下にアシスタントの兄弟を追加して再生成する。
 */
export async function executeRegenerateAssistant(
  params: ExecuteRegenerateAssistantParams,
): Promise<void> {
  const {
    assistantMessageId,
    pageContext,
    contextEnabled,
    existingPageTitles,
    setError,
    setStreaming,
    streamingContentRef,
    abortControllerRef,
    treeRef,
    setTree,
  } = params;

  const tree = treeRef.current;

  const oldAssistant = tree.messageMap[assistantMessageId];
  if (!oldAssistant || oldAssistant.role !== "assistant") {
    return;
  }

  const parentUser = tree.messageMap[oldAssistant.parentId ?? ""];
  if (!parentUser || parentUser.role !== "user") {
    return;
  }

  setError(null);

  const newAssistantId = crypto.randomUUID();
  const newAssistant: TreeChatMessage = {
    id: newAssistantId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    isStreaming: true,
    parentId: oldAssistant.parentId,
  };

  const basePath = getActivePath(tree.messageMap, parentUser.id).map(stripToChatMessage);

  setTree((prev) => ({
    ...prev,
    messageMap: addMessageToTree(prev.messageMap, newAssistant),
    activeLeafId: newAssistant.id,
  }));

  setStreaming(true);
  streamingContentRef.current = "";
  abortControllerRef.current = new AbortController();

  let settings;
  try {
    const loaded = await loadAISettings();
    if (!loaded) {
      throw new Error("AI settings not configured");
    }
    settings = loaded;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "AI設定の読み込みに失敗しました";
    patchAssistantSettingsLoadFailure(
      setTree,
      newAssistantId,
      errorMessage,
      setStreaming,
      setError,
    );
    return;
  }

  const { effectiveSettings, modelDisplayName } = resolveEffectiveAIModel(settings);

  const context = contextEnabled ? pageContext : null;
  const uniqueRefs = collectReferencedPagesFromMessages(basePath);
  const systemPrompt = buildSystemPrompt(context, existingPageTitles, uniqueRefs);

  const apiMessages: AIServiceRequest["messages"] = [
    { role: "system", content: systemPrompt },
    ...buildApiPayload(basePath, null),
  ];

  const request: AIServiceRequest = {
    provider: effectiveSettings.provider,
    model: effectiveSettings.model,
    messages: apiMessages,
    options: {
      stream: true,
      feature: "chat",
      ...(effectiveSettings.provider === "claude-code" && context?.claudeWorkspaceRoot
        ? { cwd: context.claudeWorkspaceRoot }
        : {}),
    },
  };

  await streamAssistantCompletion(effectiveSettings, request, abortControllerRef.current.signal, {
    assistantMessageId: newAssistantId,
    modelDisplayName,
    streamingContentRef,
    setTree,
    setStreaming,
    setError,
  });
}
