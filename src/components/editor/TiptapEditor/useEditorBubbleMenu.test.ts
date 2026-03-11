import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorBubbleMenu } from "./useEditorBubbleMenu";
import type { Editor } from "@tiptap/core";

vi.mock("@/hooks/usePageQueries", () => ({
  useWikiLinkExistsChecker: () =>
    ({
      checkExistence: vi.fn().mockResolvedValue({
        pageTitles: new Set(),
        referencedTitles: new Set(),
      }),
    }) as unknown,
}));

function createMockEditor(): Editor & {
  chainReturn: {
    run: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    toggleBold: ReturnType<typeof vi.fn>;
    setColor: ReturnType<typeof vi.fn>;
    unsetColor: ReturnType<typeof vi.fn>;
    insertTable: ReturnType<typeof vi.fn>;
  };
} {
  const run = vi.fn();
  const chainReturn = {
    focus: vi.fn().mockReturnThis(),
    toggleBold: vi.fn().mockReturnThis(),
    toggleItalic: vi.fn().mockReturnThis(),
    toggleStrike: vi.fn().mockReturnThis(),
    toggleCode: vi.fn().mockReturnThis(),
    toggleHighlight: vi.fn().mockReturnThis(),
    toggleBulletList: vi.fn().mockReturnThis(),
    toggleOrderedList: vi.fn().mockReturnThis(),
    toggleTaskList: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    unsetColor: vi.fn().mockReturnThis(),
    insertTable: vi.fn().mockReturnThis(),
    run,
  };
  const editor = {
    isActive: vi.fn(() => false),
    state: {
      selection: { from: 0, to: 0 },
      doc: { textBetween: vi.fn(() => "") },
    },
    chain: vi.fn(() => chainReturn),
    extensionManager: {
      extensions: [{ name: "table" }, { name: "taskList" }],
    },
    chainReturn,
  } as unknown as Editor & { chainReturn: typeof chainReturn };
  return editor;
}

describe("useEditorBubbleMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns showColorPicker, hasTable, hasTaskList and action callbacks", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() => useEditorBubbleMenu(editor));

    expect(result.current.showColorPicker).toBe(false);
    expect(result.current.hasTable).toBe(true);
    expect(result.current.hasTaskList).toBe(true);
    expect(typeof result.current.setShowColorPicker).toBe("function");
    expect(typeof result.current.toggleBold).toBe("function");
    expect(typeof result.current.convertToWikiLink).toBe("function");
    expect(typeof result.current.unsetWikiLink).toBe("function");
  });

  it("toggleBold calls editor chain toggleBold and run", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() => useEditorBubbleMenu(editor));

    act(() => {
      result.current.toggleBold();
    });

    expect(editor.chainReturn.toggleBold).toHaveBeenCalled();
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("setColor with empty string calls unsetColor", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() => useEditorBubbleMenu(editor));

    act(() => {
      result.current.setColor("");
    });

    expect(editor.chainReturn.unsetColor).toHaveBeenCalled();
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("setColor with value calls setColor and run", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() => useEditorBubbleMenu(editor));

    act(() => {
      result.current.setColor("#2563eb");
    });

    expect(editor.chainReturn.setColor).toHaveBeenCalledWith("#2563eb");
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });

  it("insertTable calls editor chain insertTable with 3x3 and run", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() => useEditorBubbleMenu(editor));

    act(() => {
      result.current.insertTable();
    });

    expect(editor.chainReturn.insertTable).toHaveBeenCalledWith({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    });
    expect(editor.chainReturn.run).toHaveBeenCalled();
  });
});
