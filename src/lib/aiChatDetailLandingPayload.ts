import type { AIChatDetailLocationState } from "../types/aiChat";
import { aiChatInitialPayloadStorageKey } from "@/constants/aiChatSidebar";

/**
 * Reads first message from router state or sessionStorage (landing stores both; survives Strict Mode).
 * ルーター state または sessionStorage から初回メッセージを読む（ランディングが両方に保存、Strict Mode 対策）。
 */
export function readPendingInitialPayload(
  conversationId: string,
  locationState: unknown,
): AIChatDetailLocationState | null {
  const fromState = locationState as AIChatDetailLocationState | null;
  if (fromState?.initialMessage?.trim()) {
    return fromState;
  }
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(aiChatInitialPayloadStorageKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AIChatDetailLocationState;
    if (parsed?.initialMessage?.trim()) return parsed;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Clears landing backup after send. / 送信後にランディング用バックアップを削除。
 */
export function clearPendingInitialPayload(conversationId: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(aiChatInitialPayloadStorageKey(conversationId));
    }
  } catch {
    // ignore
  }
}

/**
 * True while landing first message is pending (router state or sessionStorage backup).
 * ランディング初回メッセージ待ちの間（state または sessionStorage）。
 */
export function hasPendingLandingPayload(conversationId: string, locationState: unknown): boolean {
  return Boolean(readPendingInitialPayload(conversationId, locationState)?.initialMessage?.trim());
}
