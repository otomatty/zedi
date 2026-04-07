import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HtmlArtifactNodeView } from "./HtmlArtifactNodeView";
import type { NodeViewProps } from "@tiptap/react";

vi.mock("@/lib/htmlArtifact/wrapHtml", () => ({
  wrapArtifactHtml: (html: string) => `<!DOCTYPE html><body>${html}</body>`,
}));

function createMockProps(attrs: Record<string, unknown> = {}, editable = true): NodeViewProps {
  return {
    node: {
      attrs: { content: "", title: "", ...attrs },
      type: { name: "htmlArtifact" },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
    editor: { isEditable: editable },
    getPos: vi.fn(),
    extension: {} as never,
    HTMLAttributes: {},
    decorations: [],
    innerDecorations: {} as never,
  } as unknown as NodeViewProps;
}

function getIframe(): HTMLIFrameElement {
  const iframe = document.querySelector("iframe");
  if (!iframe) throw new Error("iframe not found");
  return iframe;
}

describe("HtmlArtifactNodeView", () => {
  it("renders an empty state when content is empty", () => {
    const props = createMockProps({ content: "" });
    render(<HtmlArtifactNodeView {...props} />);

    expect(screen.getByText("HTML アーティファクトが空です")).toBeInTheDocument();
  });

  it("renders a sandboxed iframe when content is provided", () => {
    const props = createMockProps({ content: "<p>Hello</p>" });
    render(<HtmlArtifactNodeView {...props} />);

    const iframe = getIframe();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toContain("<p>Hello</p>");
  });

  it("does not include allow-same-origin in sandbox", () => {
    const props = createMockProps({ content: "<div>test</div>" });
    render(<HtmlArtifactNodeView {...props} />);

    const iframe = getIframe();
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("ignores resize postMessage when event.source is not this artifact iframe", () => {
    const props = createMockProps({ content: "<div>x</div>" });
    render(<HtmlArtifactNodeView {...props} />);

    const iframe = getIframe();
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "zedi-artifact-resize", height: 40 },
          source: window,
        }),
      );
    });
    expect(iframe.style.height).toBe("300px");
  });

  it("displays the title when provided", () => {
    const props = createMockProps({ content: "<div>x</div>", title: "SIR Model" });
    render(<HtmlArtifactNodeView {...props} />);

    expect(screen.getByText("SIR Model")).toBeInTheDocument();
  });

  it("enters editing mode and calls updateAttributes on save", async () => {
    const user = userEvent.setup();
    const props = createMockProps({ content: "<p>old</p>" });
    render(<HtmlArtifactNodeView {...props} />);

    const editButton = screen.getByTitle("編集");
    await user.click(editButton);

    expect(screen.getByText("HTML アーティファクトを編集")).toBeInTheDocument();

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "<p>new</p>");

    const saveButtons = screen.getAllByRole("button");
    const saveButton = saveButtons.find((b) => b.querySelector(".lucide-check"));
    expect(saveButton).toBeTruthy();
    if (saveButton) await user.click(saveButton);

    expect(props.updateAttributes).toHaveBeenCalledWith({ content: "<p>new</p>" });
  });

  it("hides toolbar buttons when editor is not editable", () => {
    const props = createMockProps({ content: "<div>test</div>" }, false);
    render(<HtmlArtifactNodeView {...props} />);

    expect(screen.queryByTitle("編集")).not.toBeInTheDocument();
    expect(screen.queryByTitle("削除")).not.toBeInTheDocument();
  });
});
