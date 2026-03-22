import { usePageEditorEffects } from "./usePageEditorEffects";
import type { UsePageEditorEffectsOptions } from "./usePageEditorEffects";
import { usePendingChatPageGeneration } from "./usePendingChatPageGeneration";

/**
 * Editor side effects for AI: router/url handling, chat context, wiki sync,
 * and streaming full page body after create-from-chat navigation.
 * AI 向けエディタ副作用: ルータ、チャットコンテキスト、Wiki 同期、チャット経由作成後の本文ストリーム。
 */
export function usePageEditorAIEffects(options: UsePageEditorEffectsOptions): void {
  usePageEditorEffects(options);
  usePendingChatPageGeneration({
    currentPageId: options.currentPageId,
    isInitialized: options.isInitialized,
    title: options.title,
    setContent: options.setContent,
    setWikiContentForCollab: options.setWikiContentForCollab,
    saveChanges: options.saveChanges,
    toast: options.toast,
  });
}
