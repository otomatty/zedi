import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@zedi/ui";
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
};

const categoryOrder: ShortcutInfo["category"][] = ["navigation", "page", "editor"];

/**
 *
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  // Group shortcuts by category
  /**
   *
   */
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
        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-2">
          {groupedShortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">{group.label}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="border-border bg-muted rounded border px-2 py-1 font-mono text-xs">
                      {formatShortcutKey(shortcut.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-muted-foreground border-t pt-4 text-center text-xs">
          <kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono">Esc</kbd>{" "}
          で閉じる
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
