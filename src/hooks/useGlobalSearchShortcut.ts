import { useEffect } from "react";

/**
 * Hook to handle global keyboard shortcut for opening search
 * Cmd+K on Mac, Ctrl+K on Windows/Linux
 * @param onOpen - Callback function when shortcut is triggered
 */
export function useGlobalSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);
}
