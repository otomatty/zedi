import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Mermaid } from "../extensions/MermaidExtension";
import { MermaidCodeBlockNormalize } from "./mermaidCodeBlockNormalizeExtension";

/**
 * `MermaidCodeBlockNormalize` は、エディタロード時に `codeBlock` +
 * `language: "mermaid"` を `mermaid` ノードへ自動変換することを検証する。
 *
 * `MermaidCodeBlockNormalize` should rewrite legacy `codeBlock` nodes with
 * `language: "mermaid"` into dedicated `mermaid` nodes on editor load.
 */
describe("MermaidCodeBlockNormalize", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    for (const ed of editors) {
      ed.destroy();
    }
    editors.length = 0;
  });

  /**
   * 共通のエディタ生成ヘルパー。`MermaidNodeView` は React に依存するため、
   * NodeView を取り外したテスト用 Mermaid 拡張を用意して使う。
   *
   * Builds an Editor with `MermaidCodeBlockNormalize` plus a NodeView-less
   * Mermaid node (the real NodeView relies on React rendering inside the DOM,
   * which isn't needed for these unit tests).
   */
  function createEditor(content: unknown): Editor {
    const el = document.createElement("div");
    const editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4, 5] },
        }),
        Mermaid.extend({
          addNodeView: () => null as unknown as never,
        }),
        MermaidCodeBlockNormalize,
      ],
      content,
    });
    editors.push(editor);
    return editor;
  }

  it("rewrites a legacy codeBlock(language=mermaid) into a mermaid node on load", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD\nA-->B" }],
        },
      ],
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    const first = editor.state.doc.firstChild;
    expect(first?.type.name).toBe("mermaid");
    expect(first?.attrs.code).toBe("graph TD\nA-->B");
  });

  it("does not touch code blocks with a different language", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    const first = editor.state.doc.firstChild;
    expect(first?.type.name).toBe("codeBlock");
    expect(first?.attrs.language).toBe("ts");
  });

  it("strips trailing newlines from the converted source", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD\nA-->B\n\n" }],
        },
      ],
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    expect(editor.state.doc.firstChild?.attrs.code).toBe("graph TD\nA-->B");
  });

  it("rewrites multiple mermaid code blocks in the same document", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "between" }],
        },
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "sequenceDiagram" }],
        },
      ],
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    // Tiptap がトレーリング paragraph を補う可能性があるため、最初の 3 ノードだけ
    // 厳密に検証する。両方のコードブロックが正しい順序で `mermaid` ノードに
    // 変換されていることだけ確認する。
    // Tiptap may append a trailing empty paragraph; assert only the first
    // three children so both mermaid blocks are validated in order.
    const doc = editor.state.doc;
    expect(doc.childCount).toBeGreaterThanOrEqual(3);
    expect(doc.child(0).type.name).toBe("mermaid");
    expect(doc.child(0).attrs.code).toBe("graph TD");
    expect(doc.child(1).type.name).toBe("paragraph");
    expect(doc.child(2).type.name).toBe("mermaid");
    expect(doc.child(2).attrs.code).toBe("sequenceDiagram");
  });

  it("normalises a code block that is later switched to `mermaid` at runtime", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "graph TD" }],
        },
      ],
    });
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");

    // `appendTransaction` 経路で言語属性を変更すると、再度走査されて mermaid に変換される。
    // Changing the language attribute fires `appendTransaction`, which then
    // rewrites the codeBlock to a mermaid node.
    const codeBlockType = editor.schema.nodes.codeBlock;
    expect(codeBlockType).toBeDefined();
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, codeBlockType, { language: "mermaid" }));

    expect(editor.state.doc.firstChild?.type.name).toBe("mermaid");
    expect(editor.state.doc.firstChild?.attrs.code).toBe("graph TD");
  });
});
