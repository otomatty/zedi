/**
 * Hook for managing "promote to wiki" dialog state.
 * 「Wiki に残す」ダイアログ状態管理フック。
 */
import { useState, useCallback } from "react";
import { serializeChatMessagesForPageGeneration } from "@/lib/aiChatActionHelpers";
import type { ChatMessage } from "@/types/aiChat";

/**
 * Manages dialog open/close and conversation serialization for Chat → Wiki promotion.
 * Chat → Wiki 昇格用のダイアログ状態管理と会話シリアライズ。
 */
export function usePromoteToWiki(messages: ChatMessage[]) {
  const [open, setOpen] = useState(false);
  const [conversationText, setConversationText] = useState("");

  const handlePromote = useCallback(
    (_messageContent: string) => {
      setConversationText(serializeChatMessagesForPageGeneration(messages));
      setOpen(true);
    },
    [messages],
  );

  const close = useCallback(() => setOpen(false), []);

  return { open, conversationText, handlePromote, close };
}
