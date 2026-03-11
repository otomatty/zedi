import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBubbleMenuWikiLink } from "./useBubbleMenuWikiLink";
import type { Editor } from "@tiptap/core";

const mockCheckReferenced = vi.fn();
vi.mock("@/hooks/usePageQueries", () => ({
  useCheckGhostLinkReferenced: () => ({ checkReferenced: mockCheckReferenced }),
}));

function createMockEditor(options: {
  selection?: { from: number; to: number };
  textBetween?: string;
  isWikiLink?: boolean;
}): Editor & {
  chainReturn: {
    deleteRange: ReturnType<typeof vi.fn>;
    insertContent: ReturnType<typeof vi.fn>;
    unsetWikiLink: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
} {
  const { selection = { from: 0, to: 5 }, textBetween = "Foo", isWikiLink = false } = options;
  const chainRun = vi.fn();
  const deleteRange = vi.fn().mockReturnThis();
  const insertContent = vi.fn().mockReturnThis();
  const unsetWikiLink = vi.fn().mockReturnThis();
  const chainReturn = {
    focus: vi.fn().mockReturnThis(),
    deleteRange,
    insertContent,
    unsetWikiLink,
    run: chainRun,
  };
  const editor = {
    isActive: vi.fn((name: string) => (name === "wikiLink" ? isWikiLink : false)),
    state: {
      selection: { from: selection.from, to: selection.to },
      doc: { textBetween: vi.fn(() => textBetween) },
    },
    chain: vi.fn(() => chainReturn),
    chainReturn,
  } as unknown as Editor & {
    chainReturn: typeof chainReturn;
  };
  return editor;
}

describe("useBubbleMenuWikiLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckReferenced.mockResolvedValue(false);
  });

  it("returns isWikiLinkSelection false when editor is not in wikiLink", () => {
    const editor = createMockEditor({ isWikiLink: false });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));
    expect(result.current.isWikiLinkSelection).toBe(false);
  });

  it("returns isWikiLinkSelection true when editor is in wikiLink", () => {
    const editor = createMockEditor({ isWikiLink: true });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));
    expect(result.current.isWikiLinkSelection).toBe(true);
  });

  it("convertToWikiLink does nothing when selection text is empty", async () => {
    const editor = createMockEditor({ textBetween: "   " });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckReferenced).not.toHaveBeenCalled();
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("convertToWikiLink calls checkReferenced with title and pageId then inserts content", async () => {
    const editor = createMockEditor({ textBetween: "New Page" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor, pageId: "page-1" }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckReferenced).toHaveBeenCalledWith("New Page", "page-1");
    expect(editor.chain).toHaveBeenCalled();
    expect(editor.chainReturn.deleteRange).toHaveBeenCalledWith({ from: 0, to: 5 });
    expect(editor.chainReturn.insertContent).toHaveBeenCalledWith([
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "New Page", exists: false, referenced: false },
          },
        ],
        text: "[[New Page]]",
      },
    ]);
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("convertToWikiLink uses referenced true when checkReferenced returns true", async () => {
    mockCheckReferenced.mockResolvedValue(true);
    const editor = createMockEditor({ textBetween: "Ghost" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor, pageId: "p1" }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(editor.chainReturn.insertContent).toHaveBeenCalledWith([
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "Ghost", exists: false, referenced: true },
          },
        ],
        text: "[[Ghost]]",
      },
    ]);
  });

  it("convertToWikiLink does not call checkReferenced when pageId is undefined", async () => {
    const editor = createMockEditor({ textBetween: "No Page" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckReferenced).not.toHaveBeenCalled();
    expect(editor.chain).toHaveBeenCalled();
  });

  it("unsetWikiLink calls editor chain unsetWikiLink and run", () => {
    const editor = createMockEditor({});
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));

    act(() => {
      result.current.unsetWikiLink();
    });

    expect(editor.chainReturn.unsetWikiLink).toHaveBeenCalled();
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });
});
