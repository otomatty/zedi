import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

export interface UseDialogFocusTrapOptions {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  initialFocusRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Handles focus trap, Escape key, and body scroll lock for a modal dialog.
 * Call when the dialog is open; cleans up on close or unmount.
 */
export function useDialogFocusTrap({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
}: UseDialogFocusTrapOptions): void {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      if (!dialogRef.current.contains(document.activeElement)) return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, dialogRef, initialFocusRef]);
}
