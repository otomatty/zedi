/**
 * Wiki Compose navigation helpers (#950).
 *
 * チャットからのページ作成や Promote to Wiki など、旧
 * `pendingChatPageGeneration` navigate state の代わりに Compose 画面へ遷移する。
 *
 * Replaces the legacy `pendingChatPageGeneration` location state with a direct
 * route to the split-screen Compose UI. Optional seed data is forwarded so the
 * orchestrator can bias the Brief phase.
 */
import type { NavigateFunction } from "react-router-dom";
import type { PendingChatPageGenerationState } from "@/types/chatPageGeneration";

/**
 * `location.state` に載せる Compose seed のキー（チャット → ページ → compose）。
 * Location state key for Compose seed data (chat → page → compose).
 */
export const COMPOSE_SEED_STATE_KEY = "composeSeed" as const;

/**
 * チャット経由で Compose に入るときの seed。
 * Seed payload stored on `location.state` when entering Compose from chat.
 */
export type ComposeNavigationSeed = PendingChatPageGenerationState;

/**
 * `navigateToWikiCompose` の引数。
 * Parameters for {@link navigateToWikiCompose}.
 */
export interface NavigateToWikiComposeParams {
  navigate: NavigateFunction;
  noteId: string;
  pageId: string;
  /** Optional chat context to seed the Brief / research phases. */
  seed?: ComposeNavigationSeed;
}

/**
 * Navigate to the Wiki Compose split-screen for a page.
 * When `seed` is provided it is stored on location state for `WikiComposePage`.
 */
export function navigateToWikiCompose({
  navigate,
  noteId,
  pageId,
  seed,
}: NavigateToWikiComposeParams): void {
  navigate(`/notes/${noteId}/${pageId}/compose`, {
    state: seed ? { [COMPOSE_SEED_STATE_KEY]: seed } : undefined,
  });
}

/**
 * Build the Compose URL for a note-native page (toolbar / PageActionHub entry).
 */
export function wikiComposePath(noteId: string, pageId: string): string {
  return `/notes/${noteId}/${pageId}/compose`;
}
