import { useMemo } from "react";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { useAIChat } from "@/hooks/useAIChat";
import { useAIChatActions } from "@/hooks/useAIChatActions";
import { useAIChatConversations } from "@/hooks/useAIChatConversations";
import { useAIChatPanelContentHandlers } from "@/hooks/useAIChatPanelContentHandlers";
import { useAIChatPanelContentLifecycle } from "@/hooks/useAIChatPanelContentLifecycle";
import { usePagesSummary } from "@/hooks/usePageQueries";

/**
 * Arguments for {@link useAIChatPanelContentLogic} (same fields as {@link AIChatPanelContent} props except `showConversationList`).
 * {@link useAIChatPanelContentLogic} の引数（{@link AIChatPanelContent} の props から `showConversationList` を除いた形と一致）。
 */
type UseAIChatPanelContentLogicParams = {
  /**
   * Selected conversation id, or `null` when none.
   * 選択中の会話 ID。未選択のときは `null`。
   */
  activeConversationId: string | null;
  /**
   * Sets the active conversation (list selection, new conversation after first send, or clearing on page switch).
   * アクティブ会話を設定する（一覧選択・初回送信後の新規会話・ページ切り替え時のクリアなど）。
   */
  setActiveConversation: (id: string | null) => void;
  /**
   * Passed through to {@link useAIChat}: when `true`, page/note context is included in AI requests.
   * {@link useAIChat} に渡す。`true` のとき AI リクエストにページ／ノート文脈を含める。
   */
  contextEnabled: boolean;
};

/**
 * Encapsulates state, effects, and handlers for {@link AIChatPanelContent}.
 * {@link AIChatPanelContent} 向けの状態・副作用・ハンドラをまとめる。
 *
 * Orchestrates {@link useAIChat} (branched transcript, streaming, branch controls), {@link useAIChatConversations}
 * (localStorage-backed conversations), {@link useAIChatActions}, {@link useAIChatContext} page context, and
 * {@link usePagesSummary} for resolving referenced pages.
 * {@link useAIChat}（分岐トランスクリプト・ストリーミング・分岐操作）、{@link useAIChatConversations}（localStorage の会話）、
 * {@link useAIChatActions}、{@link useAIChatContext} のページ文脈、参照ページ解決用の {@link usePagesSummary} を束ねる。
 *
 * **Lifecycle / ライフサイクル**
 * - When the page context key (`pageId` or context `type`) changes, clears the active conversation and in-memory messages
 *   so the panel does not show another page’s chat.
 *   ページ文脈（`pageId` または `type`）が変わったら、アクティブ会話とメモリ上のメッセージをクリアし、別ページの会話が残らないようにする。
 * - When `activeConversationId` changes, loads that conversation into {@link useAIChat}, or clears messages if the id is unknown.
 *   `activeConversationId` が変わったら、その会話を {@link useAIChat} に読み込む。存在しなければメッセージをクリアする。
 * - While a conversation is active and there are messages, persists `messageMap`, `rootMessageId`, and `activeLeafId` via
 *   {@link useAIChatConversations.updateConversation}.
 *   会話がアクティブでメッセージがある間、`messageMap` / `rootMessageId` / `activeLeafId` を {@link useAIChatConversations} 経由で保存する。
 *
 * **First message / 初回送信**
 * - If the user sends while no conversation is selected, creates a conversation (with current page snapshot when available),
 *   activates it, then delegates to {@link useAIChat.sendMessage}.
 *   会話未選択で送信した場合は会話を作成（ページスナップショットがあれば付与）してアクティブ化し、{@link useAIChat.sendMessage} に渡す。
 *
 * **Branch UI / 分岐 UI**
 * - Exposes `activeViewTab`, `inputPrefill`, and `focusEditorNonce` so the branch tree can switch back to chat and prefill or focus the editor.
 *   ブランチツリーからチャットに戻し、入力のプリフィルまたはフォーカスするため `activeViewTab` / `inputPrefill` / `focusEditorNonce` を公開する。
 *
 * @param params - See {@link UseAIChatPanelContentLogicParams}.
 * @returns Data and callbacks for {@link AIChatPanelContent} (list, messages/tree, input).
 */
export function useAIChatPanelContentLogic({
  activeConversationId,
  setActiveConversation,
  contextEnabled,
}: UseAIChatPanelContentLogicParams) {
  const { pageContext } = useAIChatContext();
  const { data: pages = [] } = usePagesSummary();
  const {
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  } = useAIChatConversations();

  const pageConversations = getConversationsForPage(pageContext?.pageId, pageContext?.type);
  const existingPageTitles = useMemo(
    () =>
      pages
        .filter((page) => !page.isDeleted && page.title.trim().length > 0)
        .map((page) => page.title.trim()),
    [pages],
  );

  const { handleExecuteAction } = useAIChatActions({ pageContext });

  const {
    messages,
    messageMap,
    rootMessageId,
    activeLeafId,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadConversation,
    editAndResend,
    switchBranch,
    navigateToNode,
    setBranchPoint,
    deleteBranch,
    prepareBranchFromUserMessage,
    isStreaming,
  } = useAIChat({
    pageContext,
    contextEnabled,
    existingPageTitles,
    availablePages: pages,
  });

  const activeConversation = activeConversationId
    ? getConversation(activeConversationId)
    : undefined;

  useAIChatPanelContentLifecycle({
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
  });

  const handlers = useAIChatPanelContentHandlers({
    activeConversationId,
    setActiveConversation,
    pageContext,
    createConversation,
    sendMessage,
    deleteConversation,
    clearMessages,
    editAndResend,
    navigateToNode,
    setBranchPoint,
    prepareBranchFromUserMessage,
    messageMap,
    deleteBranch,
  });

  return {
    pageConversations,
    handleExecuteAction,
    messages,
    messageMap,
    rootMessageId,
    activeLeafId,
    stopStreaming,
    switchBranch,
    isStreaming,
    ...handlers,
  };
}
