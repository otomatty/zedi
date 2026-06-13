/**
 * Tauri デスクトップでのみ表示する「PDF を開く」ボタン。
 *
 * Renders a button that triggers {@link useOpenPdfFlow}. Hidden on the web
 * build because the Tauri file dialog / IPC are desktop-only. Visual style
 * matches the other primary actions in the Notes shell.
 */
import { FileText } from "lucide-react";
import { Button } from "@zedi/ui";
import { isTauriDesktop } from "@/lib/platform";
import { useOpenPdfFlow } from "./useOpenPdfFlow";

/**
 * "PDF を開く / Open PDF" button. Returns `null` on the web build so the
 * Notes shell does not show a non-functional control.
 */
export function OpenPdfButton() {
  // Compute once per render. `useState`/`useEffect` would only matter if the
  // user could switch runtimes mid-session, which they can't.
  const isDesktop = isTauriDesktop();
  const { open, isPending } = useOpenPdfFlow();

  if (!isDesktop) return null;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void open()}
      disabled={isPending}
      aria-label="PDF を開く / Open PDF"
    >
      <FileText className="size-4" />
      {isPending ? "…" : "PDF を開く / Open PDF"}
    </Button>
  );
}
