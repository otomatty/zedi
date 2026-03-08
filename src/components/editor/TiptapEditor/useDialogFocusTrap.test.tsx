import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

function TestDialog({
  open,
  onClose,
  useInitialFocusRef = true,
}: {
  open: boolean;
  onClose: () => void;
  useInitialFocusRef?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  useDialogFocusTrap({
    open,
    onClose,
    dialogRef,
    initialFocusRef: useInitialFocusRef ? initialFocusRef : { current: null },
  });

  if (!open) return null;
  return (
    <div ref={dialogRef} role="dialog">
      <button type="button" ref={initialFocusRef}>
        First
      </button>
      <button type="button">Second</button>
    </div>
  );
}

describe("useDialogFocusTrap", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  it("restores body overflow when dialog closes", () => {
    const { rerender } = render(<TestDialog open={true} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<TestDialog open={false} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<TestDialog open={true} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // JSDOM では getFocusableElements が offsetParent により [] を返すため、
  // フォールバックで first focusable に focus() が呼ばれることは検証できない。
  // ここではフックが throw せず body overflow が設定されることを確認する。
  it("runs without error when initialFocusRef is null (fallback to first focusable)", () => {
    expect(() => {
      render(<TestDialog open={true} onClose={onClose} useInitialFocusRef={false} />);
    }).not.toThrow();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
