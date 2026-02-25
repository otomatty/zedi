import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreateNewPage } from "./useCreateNewPage";
import { useAIChatStore } from "../stores/aiChatStore";
import { useAIChatContext } from "../contexts/AIChatContext";

interface KeyboardShortcutsOptions {
  onShowShortcuts?: () => void;
}

/**
 * Hook to handle global keyboard shortcuts for navigation and common actions
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onShowShortcuts } = options;
  const { createNewPage, isCreating } = useCreateNewPage();
  const { togglePanel } = useAIChatStore();
  const { aiChatAvailable } = useAIChatContext();
  const isCreatingRef = useRef(isCreating);
  isCreatingRef.current = isCreating;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const shortcuts: Array<{ match: boolean; handle: () => void }> = [
        {
          match: mod && key === "n",
          handle: () => {
            e.preventDefault();
            if (!isCreatingRef.current) createNewPage();
          },
        },
        {
          match: mod && key === "h",
          handle: () => {
            e.preventDefault();
            if (location.pathname !== "/") navigate("/");
          },
        },
        {
          match: mod && key === "/",
          handle: () => {
            e.preventDefault();
            onShowShortcuts?.();
          },
        },
        {
          match: Boolean(mod && e.shiftKey && key === "a" && aiChatAvailable),
          handle: () => {
            e.preventDefault();
            togglePanel();
          },
        },
      ];
      for (const s of shortcuts) {
        if (s.match) {
          s.handle();
          return;
        }
      }
    },
    [navigate, location.pathname, createNewPage, onShowShortcuts, togglePanel, aiChatAvailable],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * List of all keyboard shortcuts for display
 */
export interface ShortcutInfo {
  key: string;
  description: string;
  category: "navigation" | "page" | "editor" | "ai";
}

export const KEYBOARD_SHORTCUTS: ShortcutInfo[] = [
  // Navigation
  { key: "⌘K", description: "検索を開く", category: "navigation" },
  { key: "⌘H", description: "ホームに戻る", category: "navigation" },
  { key: "⌘N", description: "新規ページを作成", category: "navigation" },
  {
    key: "⌘/",
    description: "ショートカット一覧を表示",
    category: "navigation",
  },

  // Editor
  { key: "[[", description: "WikiLink を挿入", category: "editor" },

  // AI
  { key: "⌘⇧A", description: "AIチャットを開く", category: "ai" },
  { key: "# ", description: "見出し H1", category: "editor" },
  { key: "## ", description: "見出し H2", category: "editor" },
  { key: "### ", description: "見出し H3", category: "editor" },
  { key: "- ", description: "箇条書きリスト", category: "editor" },
  { key: "1. ", description: "番号付きリスト", category: "editor" },
  { key: "> ", description: "引用", category: "editor" },
  { key: "```", description: "コードブロック", category: "editor" },
  { key: "**text**", description: "太字", category: "editor" },
  { key: "*text*", description: "斜体", category: "editor" },
];

/**
 * Get platform-specific modifier key display
 */
export function getPlatformModifier(): string {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  return isMac ? "⌘" : "Ctrl+";
}

/**
 * Format shortcut key for current platform
 */
export function formatShortcutKey(key: string): string {
  const modifier = getPlatformModifier();
  return key.replace("⌘", modifier);
}
