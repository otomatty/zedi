/**
 * Location state for post–create-page AI body generation (Wiki-style stream on the editor).
 * チャットから新規ページ作成後、エディタで本文を生成するときの navigate state。
 */
export interface PendingChatPageGenerationState {
  /** User-approved bullet outline (Markdown). */
  outline: string;
  /** Serialized chat for context (may be truncated). */
  conversationText: string;
}
