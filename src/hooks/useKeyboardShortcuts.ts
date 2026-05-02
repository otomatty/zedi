import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreateNewPage } from "./useCreateNewPage";

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
  const isCreatingRef = useRef(isCreating);
  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

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
      ];
      for (const s of shortcuts) {
        if (s.match) {
          s.handle();
          return;
        }
      }
    },
    [navigate, location.pathname, createNewPage, onShowShortcuts],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Metadata for one shortcut row in the shortcuts dialog.
 * ショートカット一覧 1 行。表示文は i18n `shortcuts.items.${id}`（英語/日本語）。
 * / Display text via i18n `shortcuts.items.${id}`.
 */
export interface ShortcutInfo {
  /** i18n key under `shortcuts.items` / i18n id under `shortcuts.items` */
  id: string;
  key: string;
  category: "navigation" | "page" | "editor";
}

/**
 * List of keyboard shortcuts shown in the dialog (i18n keys, not user-facing text).
 * 表示文言は `KeyboardShortcutsDialog` で `t` を掛ける。
 * / Labels are i18n keys; use `t` in the dialog.
 */
export const KEYBOARD_SHORTCUTS: ShortcutInfo[] = [
  { id: "openSearch", key: "⌘K", category: "navigation" },
  { id: "goHome", key: "⌘H", category: "navigation" },
  { id: "newPage", key: "⌘N", category: "navigation" },
  { id: "showShortcutList", key: "⌘/", category: "navigation" },
  { id: "insertWikiLink", key: "[[", category: "editor" },
  { id: "headingH1", key: "# ", category: "editor" },
  { id: "headingH2", key: "## ", category: "editor" },
  { id: "headingH3", key: "### ", category: "editor" },
  { id: "bulletList", key: "- ", category: "editor" },
  { id: "orderedList", key: "1. ", category: "editor" },
  { id: "blockquote", key: "> ", category: "editor" },
  { id: "codeBlock", key: "```", category: "editor" },
  { id: "bold", key: "**text**", category: "editor" },
  { id: "italic", key: "*text*", category: "editor" },
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
