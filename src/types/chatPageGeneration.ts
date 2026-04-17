/**
 * Location state for post–create-page AI body generation (Wiki-style stream on the editor).
 * チャットから新規ページ作成後、エディタで本文を生成するときの navigate state。
 */
export interface PendingChatPageGenerationState {
  /** User-approved bullet outline (Markdown). */
  outline: string;
  /** Serialized chat for context (may be truncated). */
  conversationText: string;
  /**
   * Optional user-defined wiki schema injected into the generation prompt.
   * ユーザー定義スキーマ（プロンプトに注入される、任意）。
   */
  userSchema?: string;
  /**
   * Source conversation id for provenance tracking (P3).
   * 出典トレース用の会話 ID（P3）。
   */
  conversationId?: string;
}
