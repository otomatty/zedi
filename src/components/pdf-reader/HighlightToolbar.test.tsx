/**
 * Tests for {@link HighlightToolbar}.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HighlightToolbar } from "./HighlightToolbar";

function rect(opts: { top: number; left: number; width: number; height: number }): DOMRect {
  return DOMRect.fromRect({ x: opts.left, y: opts.top, width: opts.width, height: opts.height });
}

describe("HighlightToolbar", () => {
  it("renders nothing when selectionRect is null", () => {
    const { container } = render(
      <HighlightToolbar
        selectionRect={null}
        onSave={vi.fn()}
        onSaveAndDerive={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="pdf-highlight-toolbar"]')).toBeNull();
  });

  it("renders three actions when selectionRect is provided", () => {
    render(
      <HighlightToolbar
        selectionRect={rect({ top: 100, left: 50, width: 200, height: 20 })}
        onSave={vi.fn()}
        onSaveAndDerive={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^ハイライト保存/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^保存して新規ページ/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^キャンセル/ })).toBeInTheDocument();
  });

  it("fires the right callback on click", () => {
    const onSave = vi.fn();
    const onSaveAndDerive = vi.fn();
    const onCancel = vi.fn();
    render(
      <HighlightToolbar
        selectionRect={rect({ top: 100, left: 50, width: 200, height: 20 })}
        onSave={onSave}
        onSaveAndDerive={onSaveAndDerive}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^ハイライト保存/ }));
    fireEvent.click(screen.getByRole("button", { name: /^保存して新規ページ/ }));
    fireEvent.click(screen.getByRole("button", { name: /^キャンセル/ }));
    expect(onSave).toHaveBeenCalled();
    expect(onSaveAndDerive).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables buttons while isSaving", () => {
    render(
      <HighlightToolbar
        selectionRect={rect({ top: 100, left: 50, width: 200, height: 20 })}
        onSave={vi.fn()}
        onSaveAndDerive={vi.fn()}
        onCancel={vi.fn()}
        isSaving
      />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
