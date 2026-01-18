import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorSelectionMenu } from "./EditorSelectionMenu";

describe("EditorSelectionMenu", () => {
  const position = { top: 10, left: 20 };

  it("renders nothing when hidden", () => {
    const { container } = render(
      <EditorSelectionMenu
        show={false}
        position={position}
        onOpenMermaidDialog={() => {}}
        onInsertImage={() => {}}
        isReadOnly={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls handlers when buttons are clicked", async () => {
    const user = userEvent.setup();
    const onOpenMermaidDialog = vi.fn();
    const onInsertImage = vi.fn();

    render(
      <EditorSelectionMenu
        show={true}
        position={position}
        onOpenMermaidDialog={onOpenMermaidDialog}
        onInsertImage={onInsertImage}
        isReadOnly={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "ダイアグラム生成" }));
    await user.click(screen.getByRole("button", { name: "画像を挿入" }));

    expect(onOpenMermaidDialog).toHaveBeenCalledTimes(1);
    expect(onInsertImage).toHaveBeenCalledTimes(1);
  });

  it("disables image insert button when read-only", () => {
    render(
      <EditorSelectionMenu
        show={true}
        position={position}
        onOpenMermaidDialog={() => {}}
        onInsertImage={() => {}}
        isReadOnly={true}
      />
    );

    expect(screen.getByRole("button", { name: "画像を挿入" })).toBeDisabled();
  });
});
