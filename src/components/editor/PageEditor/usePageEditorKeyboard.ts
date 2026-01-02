import { useEffect } from "react";

interface UsePageEditorKeyboardOptions {
  onBack: () => void;
}

/**
 * Hook for page editor keyboard shortcuts
 * Intercepts Cmd+H / Ctrl+H to go back with proper cleanup
 */
export function usePageEditorKeyboard({
  onBack,
}: UsePageEditorKeyboardOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+H / Ctrl+H - ホームに戻る（handleBackを通す）
      if ((e.metaKey || e.ctrlKey) && e.key === "h") {
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }
    };

    // captureフェーズでイベントをキャッチ（GlobalShortcutsProviderより先に処理）
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onBack]);
}
