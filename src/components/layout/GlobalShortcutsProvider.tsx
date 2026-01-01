import React, { useState, useCallback } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsDialog } from "@/components/layout/KeyboardShortcutsDialog";

interface GlobalShortcutsProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that enables global keyboard shortcuts
 * Must be used inside BrowserRouter
 */
export function GlobalShortcutsProvider({
  children,
}: GlobalShortcutsProviderProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleShowShortcuts = useCallback(() => {
    setShortcutsOpen(true);
  }, []);

  // Register global keyboard shortcuts
  useKeyboardShortcuts({
    onShowShortcuts: handleShowShortcuts,
  });

  return (
    <>
      {children}
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </>
  );
}

export default GlobalShortcutsProvider;
