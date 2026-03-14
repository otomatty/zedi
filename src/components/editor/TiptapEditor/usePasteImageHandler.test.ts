import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { usePasteImageHandler } from "./usePasteImageHandler";

function createPasteEvent({
  text = "",
  items = [],
}: {
  text?: string;
  items?: Array<{
    type: string;
    getAsFile: () => File | null;
  }>;
}): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      items,
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
  return event;
}

function createMockEditor() {
  const dom = document.createElement("div");
  const chainReturn = {
    focus: vi.fn().mockReturnThis(),
    setImage: vi.fn().mockReturnThis(),
    run: vi.fn(),
  };

  const editor = {
    view: { dom },
    chain: vi.fn(() => chainReturn),
  } as unknown as Editor;

  return { editor, dom, chainReturn };
}

describe("usePasteImageHandler", () => {
  it("uploads pasted image files", () => {
    const { editor, dom } = createMockEditor();
    const handleImageUpload = vi.fn();
    const imageFile = new File(["image"], "example.png", { type: "image/png" });

    renderHook(() => usePasteImageHandler({ editor, handleImageUpload }));

    const event = createPasteEvent({
      items: [{ type: "image/png", getAsFile: () => imageFile }],
    });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(handleImageUpload).toHaveBeenCalledWith([imageFile]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("embeds allowed external image URLs without fetching them", () => {
    const { editor, dom, chainReturn } = createMockEditor();
    const handleImageUpload = vi.fn();

    renderHook(() => usePasteImageHandler({ editor, handleImageUpload }));

    const event = createPasteEvent({
      text: "https://cdn.example.com/path/example.png?size=large",
    });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(chainReturn.focus).toHaveBeenCalled();
    expect(chainReturn.setImage).toHaveBeenCalledWith({
      src: "https://cdn.example.com/path/example.png?size=large",
      alt: "example.png",
      title: "https://cdn.example.com/path/example.png?size=large",
    });
    expect(chainReturn.run).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not auto-embed localhost image URLs", () => {
    const { editor, dom, chainReturn } = createMockEditor();
    const handleImageUpload = vi.fn();

    renderHook(() => usePasteImageHandler({ editor, handleImageUpload }));

    const event = createPasteEvent({
      text: "http://localhost:3000/example.png",
    });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(chainReturn.setImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not auto-embed private network image URLs", () => {
    const { editor, dom, chainReturn } = createMockEditor();
    const handleImageUpload = vi.fn();

    renderHook(() => usePasteImageHandler({ editor, handleImageUpload }));

    const event = createPasteEvent({
      text: "http://192.168.0.10/example.png",
    });

    act(() => {
      dom.dispatchEvent(event);
    });

    expect(chainReturn.setImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
