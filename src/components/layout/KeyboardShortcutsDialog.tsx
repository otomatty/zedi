import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@zedi/ui";
import {
  KEYBOARD_SHORTCUTS,
  formatShortcutKey,
  type ShortcutInfo,
} from "@/hooks/useKeyboardShortcuts";
import { useTranslation } from "react-i18next";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryOrder: ShortcutInfo["category"][] = ["navigation", "page", "editor"];

/**
 *
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();
  const categoryLabels: Record<ShortcutInfo["category"], string> = {
    navigation: t("shortcuts.category.navigation"),
    page: t("shortcuts.category.page"),
    editor: t("shortcuts.category.editor"),
  };
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
          <DialogTitle>{t("shortcuts.dialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-2">
          {groupedShortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-muted-foreground mb-3 text-sm font-medium">{group.label}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-1">
                    <span className="text-sm">{t(`shortcuts.items.${shortcut.id}` as const)}</span>
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
          {t("shortcuts.closeWithEsc")}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
