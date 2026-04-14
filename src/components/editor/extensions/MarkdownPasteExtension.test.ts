import { describe, expect, it, vi } from "vitest";
import { looksLikeMarkdown, MarkdownPaste } from "./MarkdownPasteExtension";

// ---------------------------------------------------------------------------
// looksLikeMarkdown 単体テスト / Unit tests for looksLikeMarkdown
// ---------------------------------------------------------------------------
describe("looksLikeMarkdown", () => {
  it("detects headings", () => {
    expect(looksLikeMarkdown("# Hello")).toBe(true);
    expect(looksLikeMarkdown("## Second")).toBe(true);
    expect(looksLikeMarkdown("### Third")).toBe(true);
  });

  it("detects unordered lists", () => {
    expect(looksLikeMarkdown("- item 1\n- item 2\n- item 3")).toBe(true);
    expect(looksLikeMarkdown("* item")).toBe(true);
    expect(looksLikeMarkdown("+ item")).toBe(true);
  });

  it("detects ordered lists", () => {
    expect(looksLikeMarkdown("1. first\n2. second")).toBe(true);
  });

  it("detects fenced code blocks", () => {
    expect(looksLikeMarkdown("```js\nconsole.log('hello')\n```")).toBe(true);
  });

  it("detects indented fenced code blocks (up to 3 spaces)", () => {
    expect(looksLikeMarkdown("   ```js\nx\n```")).toBe(true);
  });

  it("detects blockquotes", () => {
    expect(looksLikeMarkdown("> some quote")).toBe(true);
  });

  it("detects bold text", () => {
    expect(looksLikeMarkdown("This is **bold** text")).toBe(true);
    expect(looksLikeMarkdown("This is __bold__ text")).toBe(true);
  });

  it("detects task lists", () => {
    expect(looksLikeMarkdown("- [ ] todo")).toBe(true);
    expect(looksLikeMarkdown("- [x] done")).toBe(true);
  });

  it("detects tables", () => {
    expect(looksLikeMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
  });

  it("detects links", () => {
    expect(looksLikeMarkdown("[click](https://example.com)")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeMarkdown("Just plain text without markdown")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(looksLikeMarkdown("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MarkdownPaste extension テスト / Extension integration tests
// ---------------------------------------------------------------------------

/**
 * ProseMirror handlePaste の引数を模擬するヘルパー。
 * Helper that simulates ProseMirror handlePaste arguments.
 */
function createMockPasteEvent(text: string): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
  return event;
}

// ---------------------------------------------------------------------------
// ヘルパー: プラグインの handlePaste を取得する
// Helper: extract handlePaste from the extension's ProseMirror plugin
// ---------------------------------------------------------------------------

type HandlePasteFn = (view: unknown, event: ClipboardEvent, slice: unknown) => boolean;

interface MockEditorOptions {
  parse?: ReturnType<typeof vi.fn>;
  insertContent?: ReturnType<typeof vi.fn>;
  hasMarkdown?: boolean;
  isEditable?: boolean;
}

function getHandlePaste(opts: MockEditorOptions = {}): {
  handlePaste: HandlePasteFn;
  mockEditor: {
    markdown: { parse: ReturnType<typeof vi.fn> } | undefined;
    commands: { insertContent: ReturnType<typeof vi.fn> };
    isEditable: boolean;
  };
} {
  const mockEditor = {
    markdown: opts.hasMarkdown === false ? undefined : { parse: opts.parse ?? vi.fn() },
    commands: { insertContent: opts.insertContent ?? vi.fn(() => true) },
    isEditable: opts.isEditable !== false,
  };

  const addPlugins = MarkdownPaste.config.addProseMirrorPlugins;
  if (!addPlugins) throw new Error("addProseMirrorPlugins not found");

  const plugins = addPlugins.call({ editor: mockEditor } as never);
  const handlePaste = plugins[0].props.handlePaste as HandlePasteFn;

  return { handlePaste, mockEditor };
}

describe("MarkdownPaste extension", () => {
  it("exports the extension with correct name", () => {
    expect(MarkdownPaste.name).toBe("markdownPaste");
  });

  it("parses markdown text and inserts as rich content", () => {
    const parsedDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hello" }] },
      ],
    };
    const { handlePaste, mockEditor } = getHandlePaste({
      parse: vi.fn(() => parsedDoc),
    });

    const event = createMockPasteEvent("# Hello World");
    expect(handlePaste(null, event, null)).toBe(true);
    expect(mockEditor.markdown?.parse).toHaveBeenCalledWith("# Hello World");
    expect(mockEditor.commands.insertContent).toHaveBeenCalledWith(parsedDoc);
  });

  it("returns false for plain text without markdown patterns", () => {
    const { handlePaste, mockEditor } = getHandlePaste();

    const event = createMockPasteEvent("Just plain text");
    expect(handlePaste(null, event, null)).toBe(false);
    expect(mockEditor.markdown?.parse).not.toHaveBeenCalled();
  });

  it("returns false when editor.markdown is not available", () => {
    const { handlePaste } = getHandlePaste({ hasMarkdown: false });

    const event = createMockPasteEvent("# Hello");
    expect(handlePaste(null, event, null)).toBe(false);
  });

  it("falls back to default paste when markdown.parse throws", () => {
    const { handlePaste, mockEditor } = getHandlePaste({
      parse: vi.fn(() => {
        throw new Error("parse error");
      }),
    });

    const event = createMockPasteEvent("# Hello");
    expect(handlePaste(null, event, null)).toBe(false);
    expect(mockEditor.commands.insertContent).not.toHaveBeenCalled();
  });

  it("handles markdown even when clipboard also contains HTML (e.g. VS Code)", () => {
    const parsedDoc = { type: "doc", content: [] };
    const { handlePaste, mockEditor } = getHandlePaste({
      parse: vi.fn(() => parsedDoc),
    });

    // handlePaste は text/plain のみ参照する（ProseMirror レベルで HTML は別途処理済み）
    // handlePaste only reads text/plain (HTML is already processed by ProseMirror)
    const event = createMockPasteEvent("# Hello");
    expect(handlePaste(null, event, null)).toBe(true);
    expect(mockEditor.markdown?.parse).toHaveBeenCalledWith("# Hello");
    expect(mockEditor.commands.insertContent).toHaveBeenCalledWith(parsedDoc);
  });

  it("returns false when editor is read-only", () => {
    const { handlePaste, mockEditor } = getHandlePaste({
      isEditable: false,
    });

    const event = createMockPasteEvent("# Hello");
    expect(handlePaste(null, event, null)).toBe(false);
    expect(mockEditor.markdown?.parse).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Wikiリンクペーストの統合テスト / Wiki link paste integration tests
// ---------------------------------------------------------------------------

describe("MarkdownPaste extension - wiki links", () => {
  /**
   * editor.markdown.parse がテキストをそのまま段落として返すモック。
   * Mock `parse` that echoes the text back as a single paragraph.
   */
  function createEchoParse() {
    return vi.fn((text: string) => ({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    }));
  }

  it("intercepts paste of a bare wiki link like [[Foo]]", () => {
    const { handlePaste, mockEditor } = getHandlePaste({ parse: createEchoParse() });

    const event = createMockPasteEvent("[[Foo]]");
    expect(handlePaste(null, event, null)).toBe(true);
    expect(mockEditor.commands.insertContent).toHaveBeenCalledTimes(1);
  });

  it("applies wikiLink mark to pasted [[Title]] text", () => {
    const { handlePaste, mockEditor } = getHandlePaste({ parse: createEchoParse() });

    const event = createMockPasteEvent("[[Foo]]");
    handlePaste(null, event, null);

    const inserted = mockEditor.commands.insertContent.mock.calls[0]?.[0] as {
      content: Array<{
        content: Array<{
          type: string;
          text: string;
          marks?: Array<{ type: string; attrs: Record<string, unknown> }>;
        }>;
      }>;
    };
    const textNode = inserted.content[0].content[0];
    expect(textNode.text).toBe("Foo");
    expect(textNode.marks).toEqual([
      {
        type: "wikiLink",
        attrs: { title: "Foo", exists: false, referenced: false },
      },
    ]);
  });

  it("handles wiki links mixed with surrounding text", () => {
    const { handlePaste, mockEditor } = getHandlePaste({ parse: createEchoParse() });

    const event = createMockPasteEvent("see [[Foo]] today");
    expect(handlePaste(null, event, null)).toBe(true);

    const inserted = mockEditor.commands.insertContent.mock.calls[0]?.[0] as {
      content: Array<{
        content: Array<{ type: string; text: string; marks?: unknown[] }>;
      }>;
    };
    const nodes = inserted.content[0].content;
    expect(nodes).toHaveLength(3);
    expect(nodes[0].text).toBe("see ");
    expect(nodes[1].text).toBe("Foo");
    expect(nodes[1].marks).toBeDefined();
    expect(nodes[2].text).toBe(" today");
  });

  it("applies wiki link transformation even when markdown patterns co-exist", () => {
    const { handlePaste, mockEditor } = getHandlePaste({ parse: createEchoParse() });

    const event = createMockPasteEvent("# Heading with [[Ref]]");
    expect(handlePaste(null, event, null)).toBe(true);

    const inserted = mockEditor.commands.insertContent.mock.calls[0]?.[0] as {
      content: Array<{
        content: Array<{
          type: string;
          text: string;
          marks?: Array<{ type: string }>;
        }>;
      }>;
    };
    const textNodes = inserted.content[0].content;
    const wikiNode = textNodes.find((n) => n.text === "Ref");
    expect(wikiNode).toBeDefined();
    expect(wikiNode?.marks?.[0]?.type).toBe("wikiLink");
  });

  it("does not intercept text with empty-bracket pattern only", () => {
    const { handlePaste, mockEditor } = getHandlePaste({ parse: createEchoParse() });

    const event = createMockPasteEvent("empty [[]] brackets");
    // `[[]]` は Wikiリンクとも Markdown ともみなされないため、デフォルト処理に委ねる。
    // `[[]]` matches neither wiki link nor markdown patterns, so fall through.
    expect(handlePaste(null, event, null)).toBe(false);
    expect(mockEditor.commands.insertContent).not.toHaveBeenCalled();
  });

  it("skips transformation when markdown.parse throws (falls back)", () => {
    const { handlePaste, mockEditor } = getHandlePaste({
      parse: vi.fn(() => {
        throw new Error("parse error");
      }),
    });

    const event = createMockPasteEvent("[[Foo]]");
    expect(handlePaste(null, event, null)).toBe(false);
    expect(mockEditor.commands.insertContent).not.toHaveBeenCalled();
  });
});
