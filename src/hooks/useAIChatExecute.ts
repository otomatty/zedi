import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ChatMessage,
  ChatTreeState,
  PageContext,
  ReferencedPage,
  TreeChatMessage,
} from "../types/aiChat";
import type { AIServiceRequest } from "../lib/aiService";
import { loadAISettings } from "../lib/aiSettings";
import { buildSystemPrompt } from "../lib/aiChatPrompt";
import { useMcpConfigStore } from "../stores/mcpConfigStore";
import { addMessageToTree, getActivePath, stripToChatMessage } from "../lib/messageTree";
import {
  buildApiPayload,
  collectReferencedPagesFromMessages,
  patchAssistantSettingsLoadFailure,
  resolveEffectiveAIModel,
  streamAssistantCompletion,
} from "./useAIChatExecuteHelpers";

export { executeRegenerateAssistant } from "./useAIChatExecuteRegenerate";
export type { ExecuteRegenerateAssistantParams } from "./useAIChatExecuteRegenerate";

/**
 * Parameters for {@link executeSendMessage}.
 * {@link executeSendMessage} に渡す引数。
 */
export interface ExecuteSendMessageParams {
  content: string;
  messageRefs: ReferencedPage[];
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles: string[];
  setError: (value: string | null) => void;
  setStreaming: (value: boolean) => void;
  streamingContentRef: MutableRefObject<string>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  treeRef: MutableRefObject<ChatTreeState>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  /** 指定時はこのユーザーメッセージと同じ親に新しいユーザーを追加（編集ブランチ）。 */
  branchFromUserMessageId?: string;
}

/**
 * Sends a new user message (and streams assistant) on the active branch or as a sibling branch.
 * アクティブブランチ、または編集による兄弟ブランチにユーザーメッセージを送る。
 */
export async function executeSendMessage(params: ExecuteSendMessageParams): Promise<void> {
  const {
    content,
    messageRefs,
    pageContext,
    contextEnabled,
    existingPageTitles,
    setError,
    setStreaming,
    streamingContentRef,
    abortControllerRef,
    treeRef,
    setTree,
    branchFromUserMessageId,
  } = params;

  const tree = treeRef.current;

  setError(null);

  const userMessage: TreeChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    referencedPages: messageRefs.length > 0 ? messageRefs : undefined,
    timestamp: Date.now(),
    parentId: null,
  };

  const assistantMessageId = crypto.randomUUID();
  const assistantMessage: TreeChatMessage = {
    id: assistantMessageId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    isStreaming: true,
    parentId: userMessage.id,
  };

  let basePath: ChatMessage[];

  if (branchFromUserMessageId !== undefined) {
    const oldUser = tree.messageMap[branchFromUserMessageId];
    if (!oldUser || oldUser.role !== "user") {
      return;
    }
    userMessage.parentId = oldUser.parentId;
    basePath =
      oldUser.parentId === null
        ? []
        : getActivePath(tree.messageMap, oldUser.parentId).map(stripToChatMessage);
  } else {
    userMessage.parentId = tree.activeLeafId;
    basePath =
      tree.activeLeafId === null
        ? []
        : getActivePath(tree.messageMap, tree.activeLeafId).map(stripToChatMessage);
  }

  setTree((prev) => {
    let map = addMessageToTree(prev.messageMap, userMessage);
    map = addMessageToTree(map, assistantMessage);
    return {
      messageMap: map,
      rootMessageId: prev.rootMessageId ?? userMessage.id,
      activeLeafId: assistantMessage.id,
    };
  });

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
      assistantMessageId,
      errorMessage,
      setStreaming,
      setError,
    );
    return;
  }

  const { effectiveSettings, modelDisplayName } = resolveEffectiveAIModel(settings);

  const context = contextEnabled ? pageContext : null;
  const uniqueRefs = collectReferencedPagesFromMessages([
    ...basePath,
    stripToChatMessage(userMessage),
  ]);
  const mcpServers =
    effectiveSettings.provider === "claude-code" ? useMcpConfigStore.getState().servers : [];
  const systemPrompt = buildSystemPrompt(context, existingPageTitles, uniqueRefs, mcpServers);

  const apiMessages: AIServiceRequest["messages"] = [
    { role: "system", content: systemPrompt },
    ...buildApiPayload(basePath, stripToChatMessage(userMessage)),
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
    assistantMessageId,
    modelDisplayName,
    streamingContentRef,
    setTree,
    setStreaming,
    setError,
  });
}
