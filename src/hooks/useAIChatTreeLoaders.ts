import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ChatMessage, ChatTreeState, Conversation } from "../types/aiChat";
import { migrateConversation, flatMessagesToTree } from "@/lib/conversationMigration";
import { emptyTree } from "./aiChatEmptyTree";

/**
 * Parameters for {@link useAIChatTreeLoaders}.
 * {@link useAIChatTreeLoaders} の引数。
 */
type UseAIChatTreeLoadersParams = {
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  setError: (value: string | null) => void;
};

/**
 * Load/clear helpers for the AI chat message tree (legacy flat list and persisted conversations).
 * AI チャットツリーの読み込み／クリア（旧フラット一覧・永続化会話）。
 */
export function useAIChatTreeLoaders({ setTree, setError }: UseAIChatTreeLoadersParams) {
  const clearMessages = useCallback(() => {
    setTree(emptyTree);
    setError(null);
  }, [setTree, setError]);

  /**
   * Load a legacy flat message list (converts to a linear tree).
   * 旧フラット履歴を読み込み（線形ツリーに変換）。
   */
  const loadMessages = useCallback(
    (msgs: ChatMessage[]) => {
      setTree(flatMessagesToTree(msgs));
    },
    [setTree],
  );

  /**
   * Load a persisted conversation (migrates legacy `messages` when needed).
   * 永続化会話を読み込む（必要なら旧 `messages` を移行）。
   */
  const loadConversation = useCallback(
    (conversation: Conversation) => {
      const migrated = migrateConversation(conversation);
      setTree({
        messageMap: migrated.messageMap ?? {},
        rootMessageId: migrated.rootMessageId ?? null,
        activeLeafId: migrated.activeLeafId ?? null,
      });
    },
    [setTree],
  );

  return { clearMessages, loadMessages, loadConversation };
}
