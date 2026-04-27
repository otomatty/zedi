/**
 * Tests for inserting Markdown returned by Claude into the Tiptap editor.
 * Claude が返した Markdown を Tiptap に挿入する処理のテスト。
 */

import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/markdownToTiptap", () => ({
  convertMarkdownToTiptapContent: vi.fn(),
}));

import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import { insertSlashAgentMarkdownAt } from "./insertSlashAgentMarkdown";

/**
 * Builds a fluent chain spy that captures `insertContentAt` arguments.
 * `insertContentAt` の呼び出しを記録するチェーンスパイを構築する。
 */
function makeChainSpy(): {
  chain: () => {
    focus: () => { insertContentAt: ReturnType<typeof vi.fn> };
  };
  insertContentAt: ReturnType<typeof vi.fn>;
} {
  const insertContentAt = vi.fn(() => ({ run: vi.fn() }));
  const chain = vi.fn(() => ({
    focus: vi.fn(() => ({ insertContentAt })),
  }));
  return { chain, insertContentAt };
}

/**
 * Builds an editor mock with a fluent chain and a doc of the given size.
 * 指定サイズの doc とチェーンスパイを持つエディタモックを返す。
 */
function makeMockEditor(docSize: number): {
  editor: Editor;
  insertContentAt: ReturnType<typeof vi.fn>;
} {
  const { chain, insertContentAt } = makeChainSpy();
  const editor = {
    chain,
    state: {
      doc: { content: { size: docSize } },
    },
  } as unknown as Editor;
  return { editor, insertContentAt };
}

beforeEach(() => {
  vi.mocked(convertMarkdownToTiptapContent).mockReset();
});

describe("insertSlashAgentMarkdownAt", () => {
  it("inserts converted content at the cursor position when position='cursor'", () => {
    const fakeJson = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue(fakeJson);

    const { editor, insertContentAt } = makeMockEditor(100);
    insertSlashAgentMarkdownAt(editor, 7, "**hi**", "cursor");

    // AI（エージェント）出力経路のため `dropLeadingH1: true` が渡る（issue #784）。
    // The agent (AI) output path passes `dropLeadingH1: true` (issue #784).
    expect(convertMarkdownToTiptapContent).toHaveBeenCalledWith("**hi**", { dropLeadingH1: true });
    expect(insertContentAt).toHaveBeenCalledTimes(1);
    expect(insertContentAt).toHaveBeenCalledWith(7, [
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    ]);
  });

  it("inserts at the document end when position='end'", () => {
    const fakeJson = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue(fakeJson);

    const { editor, insertContentAt } = makeMockEditor(42);
    insertSlashAgentMarkdownAt(editor, 7, "any", "end");

    expect(insertContentAt).toHaveBeenCalledWith(42, [{ type: "paragraph" }]);
  });

  it("trims whitespace and substitutes a placeholder for empty results", () => {
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue(
      JSON.stringify({ type: "doc", content: [] }),
    );

    const { editor } = makeMockEditor(10);
    insertSlashAgentMarkdownAt(editor, 0, "   \n  ", "cursor");

    // 空白のみの結果は "(empty result)" に置換され、ユーザに変換不能を示す。
    // Whitespace-only results are replaced with "(empty result)" so the user notices.
    expect(convertMarkdownToTiptapContent).toHaveBeenCalledWith("(empty result)", {
      dropLeadingH1: true,
    });
  });

  it("handles missing content array by inserting an empty list (no crash)", () => {
    // content が無いケースでも例外にならず、空配列で挿入する契約。
    // When `content` is missing, fall back to `[]` instead of throwing.
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue(JSON.stringify({ type: "doc" }));

    const { editor, insertContentAt } = makeMockEditor(10);
    insertSlashAgentMarkdownAt(editor, 3, "x", "cursor");

    expect(insertContentAt).toHaveBeenCalledWith(3, []);
  });

  it("falls back to a plain paragraph when conversion JSON cannot be parsed", () => {
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue("not-json{");

    const { editor, insertContentAt } = makeMockEditor(10);
    insertSlashAgentMarkdownAt(editor, 5, "raw text", "cursor");

    expect(insertContentAt).toHaveBeenCalledWith(5, [
      {
        type: "paragraph",
        content: [{ type: "text", text: "raw text" }],
      },
    ]);
  });

  it("falls back with the placeholder text when an empty input cannot be parsed either", () => {
    // 空入力 + パース失敗の合成ケース：プレースホルダがフォールバック段落に入る。
    // Empty input + parse failure: the placeholder text seeds the fallback paragraph.
    vi.mocked(convertMarkdownToTiptapContent).mockReturnValue("not-json{");

    const { editor, insertContentAt } = makeMockEditor(10);
    insertSlashAgentMarkdownAt(editor, 0, "", "cursor");

    expect(insertContentAt).toHaveBeenCalledWith(0, [
      {
        type: "paragraph",
        content: [{ type: "text", text: "(empty result)" }],
      },
    ]);
  });
});
