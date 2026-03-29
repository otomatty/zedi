import { useCallback } from "react";
import { useAIChatConversations } from "./useAIChatConversations";
import { useAIChatStore } from "@/stores/aiChatStore";

/**
 * Deletes a conversation and clears the active selection if it was the same id.
 * 会話を削除し、選択中ならアクティブ会話 ID をクリアする。
 */
export function useDeleteAIConversation() {
  const { deleteConversation } = useAIChatConversations();
  const setActiveConversation = useAIChatStore((s) => s.setActiveConversation);

  return useCallback(
    (id: string) => {
      deleteConversation(id);
      if (useAIChatStore.getState().activeConversationId === id) {
        setActiveConversation(null);
      }
    },
    [deleteConversation, setActiveConversation],
  );
}
