import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { useMarkdownPasteHandler } from "./useMarkdownPasteHandler";

function createPasteEvent({
  text = "",
  html = "",
}: {
  text?: string;
  html?: string;
}): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => {
        if (type === "text/plain") return text;
        if (type === "text/html") return html;
        return "";
      },
    },
  });
  return event;
}

function createMockEditor(hasMarkdown = true) {
  const dom = document.createElement("div");

  const parsedDoc = {
    type: "doc",
    content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello" }] }],
  };

  const insertContent = vi.fn(() => true);

  const editor = {
    view: {
      dom,
    },
    commands: {
      insertContent,
    },
    markdown: hasMarkdown
      ? {
          parse: vi.fn(() => parsedDoc),
        }
      : undefined,
  } as unknown as Editor;

  return { editor, dom, insertContent, parsedDoc };
}

describe("useMarkdownPasteHandler", () => {
  it("converts pasted markdown text to rich content", () => {
    const { editor, dom, insertContent, parsedDoc } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "# Hello World" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(
      (editor as unknown as { markdown: { parse: ReturnType<typeof vi.fn> } }).markdown.parse,
    ).toHaveBeenCalledWith("# Hello World");
    expect(insertContent).toHaveBeenCalledWith(parsedDoc);
  });

  it("does not intercept plain text without markdown patterns", () => {
    const { editor, dom, insertContent } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "Just plain text without markdown" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(insertContent).not.toHaveBeenCalled();
  });

  it("does not intercept when HTML is present (rich paste)", () => {
    const { editor, dom, insertContent } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({
      text: "# Hello",
      html: "<h1>Hello</h1>",
    });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(insertContent).not.toHaveBeenCalled();
  });

  it("does not run when another handler already called preventDefault", () => {
    const { editor, dom, insertContent } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "# Hello World" });
    event.preventDefault();

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(insertContent).not.toHaveBeenCalled();
  });

  it("handles bold markdown", () => {
    const { editor, dom } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "This is **bold** text" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("handles list markdown", () => {
    const { editor, dom } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "- item 1\n- item 2\n- item 3" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("handles code block markdown", () => {
    const { editor, dom } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "```js\nconsole.log('hello')\n```" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("detects indented fenced code blocks (up to 3 spaces)", () => {
    const { editor, dom } = createMockEditor();

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "   ```js\nx\n```" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing when editor.markdown is not available", () => {
    const { editor, dom, insertContent } = createMockEditor(false);

    renderHook(() => useMarkdownPasteHandler({ editor }));

    const event = createPasteEvent({ text: "# Hello" });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(insertContent).not.toHaveBeenCalled();
  });
});
