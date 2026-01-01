import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  KEYBOARD_SHORTCUTS,
  formatShortcutKey,
  type ShortcutInfo,
} from "@/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryLabels: Record<ShortcutInfo["category"], string> = {
  navigation: "ナビゲーション",
  page: "ページ操作",
  editor: "エディタ",
  ai: "AI 機能",
};

const categoryOrder: ShortcutInfo["category"][] = [
  "navigation",
  "page",
  "editor",
  "ai",
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  // Group shortcuts by category
  const groupedShortcuts = categoryOrder
    .map((category) => ({
      category,
      label: categoryLabels[category],
      shortcuts: KEYBOARD_SHORTCUTS.filter((s) => s.category === category),
    }))
    .filter((group) => group.shortcuts.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>キーボードショートカット</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {groupedShortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border">
                      {formatShortcutKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t text-xs text-muted-foreground text-center">
          <kbd className="px-1.5 py-0.5 font-mono bg-muted rounded border border-border">
            Esc
          </kbd>{" "}
          で閉じる
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
