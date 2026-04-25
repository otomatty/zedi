import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBubbleMenuWikiLink } from "./useBubbleMenuWikiLink";
import type { Editor } from "@tiptap/core";

const mockCheckExistence = vi.fn();
vi.mock("@/hooks/usePageQueries", () => ({
  useWikiLinkExistsChecker: () => ({ checkExistence: mockCheckExistence }),
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
    // issue #737: 既定モックは `pageTitleToId` を空 Map で返す。個別テストが
    // resolved 経路を試したい場合は `mockResolvedValue` を上書きする。
    // Default mock returns an empty `pageTitleToId` (issue #737); tests that
    // exercise the resolved branch override `mockResolvedValue` directly.
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(),
      pageTitleToId: new Map(),
    });
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

  it("returns isConverting false initially", () => {
    const editor = createMockEditor({ textBetween: "Foo" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));
    expect(result.current.isConverting).toBe(false);
  });

  it("convertToWikiLink does nothing when selection text is empty", async () => {
    const editor = createMockEditor({ textBetween: "   " });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckExistence).not.toHaveBeenCalled();
    expect(editor.chain).not.toHaveBeenCalled();
  });

  it("convertToWikiLink calls checkExistence with titles and pageId then inserts content", async () => {
    const editor = createMockEditor({ textBetween: "New Page" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor, pageId: "page-1" }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckExistence).toHaveBeenCalledWith(["New Page"], "page-1");
    expect(editor.chain).toHaveBeenCalled();
    expect(editor.chainReturn.deleteRange).toHaveBeenCalledWith({ from: 0, to: 5 });
    expect(editor.chainReturn.insertContent).toHaveBeenCalledWith([
      {
        type: "text",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "New Page", exists: false, referenced: false, targetId: null },
          },
        ],
        text: "[[New Page]]",
      },
    ]);
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("convertToWikiLink uses exists, referenced, and targetId from checkExistence", async () => {
    // issue #737: 解決済みターゲットの id を `targetId` 属性に埋める。
    // Resolved target id is written into the `targetId` attribute (issue #737).
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(["existing page"]),
      referencedTitles: new Set(["existing page"]),
      pageTitleToId: new Map([["existing page", "page-existing-id"]]),
    });
    const editor = createMockEditor({ textBetween: "Existing Page" });
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
            attrs: {
              title: "Existing Page",
              exists: true,
              referenced: true,
              targetId: "page-existing-id",
            },
          },
        ],
        text: "[[Existing Page]]",
      },
    ]);
  });

  it("convertToWikiLink uses referenced true and null targetId when only ghosted", async () => {
    mockCheckExistence.mockResolvedValue({
      pageTitles: new Set(),
      referencedTitles: new Set(["ghost"]),
      pageTitleToId: new Map(),
    });
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
            // `targetId` は未解決なので `null`（リネーム伝播はタイトル一致 fallback）。
            // Unresolved → `targetId: null` (rename uses title fallback).
            attrs: { title: "Ghost", exists: false, referenced: true, targetId: null },
          },
        ],
        text: "[[Ghost]]",
      },
    ]);
  });

  it("convertToWikiLink does not call checkExistence when pageId is undefined", async () => {
    const editor = createMockEditor({ textBetween: "No Page" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor }));

    await act(async () => {
      await result.current.convertToWikiLink();
    });

    expect(mockCheckExistence).not.toHaveBeenCalled();
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

  it("convertToWikiLink ignores second call until first resolves (re-entrancy guard)", async () => {
    type CheckResult = {
      pageTitles: Set<string>;
      referencedTitles: Set<string>;
      pageTitleToId: Map<string, string>;
    };
    const deferred: { resolve: (v: CheckResult) => void } = { resolve: () => {} };
    const checkPromise = new Promise<CheckResult>((r) => {
      deferred.resolve = r;
    });
    mockCheckExistence.mockReturnValue(checkPromise);

    const editor = createMockEditor({ textBetween: "Foo" });
    const { result } = renderHook(() => useBubbleMenuWikiLink({ editor, pageId: "page-1" }));

    let firstCall: Promise<void> | undefined;
    await act(async () => {
      firstCall = result.current.convertToWikiLink();
      result.current.convertToWikiLink();
      result.current.convertToWikiLink();
    });

    expect(mockCheckExistence).toHaveBeenCalledTimes(1);
    expect(editor.chain).not.toHaveBeenCalled();

    if (firstCall === undefined) throw new Error("expected firstCall");
    await act(async () => {
      deferred.resolve({
        pageTitles: new Set(),
        referencedTitles: new Set(),
        pageTitleToId: new Map(),
      });
      await firstCall;
    });

    expect(mockCheckExistence).toHaveBeenCalledTimes(1);
    expect(editor.chain).toHaveBeenCalledTimes(1);
    expect(result.current.isConverting).toBe(false);
  });
});
