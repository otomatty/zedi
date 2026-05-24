import { describe, expect, it } from "vitest";
import {
  containsMermaidFence,
  transformMermaidCodeBlocksInContent,
} from "./transformMermaidCodeBlocksInContent";

describe("containsMermaidFence", () => {
  it("returns true for a fenced mermaid block", () => {
    expect(containsMermaidFence("```mermaid\ngraph TD\nA-->B\n```")).toBe(true);
  });

  it("matches uppercase / mixed case language identifiers", () => {
    expect(containsMermaidFence("```Mermaid\ngraph TD\n```")).toBe(true);
    expect(containsMermaidFence("```MERMAID\ngraph TD\n```")).toBe(true);
  });

  it("tolerates leading whitespace and spaces after the fence", () => {
    expect(containsMermaidFence("   ```   mermaid\nx\n```")).toBe(true);
  });

  it("returns false for non-mermaid fences", () => {
    expect(containsMermaidFence("```ts\nconsole.log()\n```")).toBe(false);
  });

  it("returns false when the language is just a prefix of 'mermaid'", () => {
    // `mer` は `mermaid` の接頭辞だが別言語として扱う。`\b` で完全一致のみマッチする。
    // `mer` happens to be a prefix of `mermaid` but is a different language;
    // the `\b` word-boundary anchor keeps the check strict.
    expect(containsMermaidFence("```mer\nx\n```")).toBe(false);
  });

  it("returns false for inline backticks", () => {
    expect(containsMermaidFence("see `mermaid` for details")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsMermaidFence("")).toBe(false);
  });
});

describe("transformMermaidCodeBlocksInContent", () => {
  it("replaces a top-level mermaid codeBlock with a mermaid node", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD\n  A-->B" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual({
      type: "doc",
      content: [
        {
          type: "mermaid",
          attrs: { code: "graph TD\n  A-->B" },
        },
      ],
    });
  });

  it("supports the snake-cased `code_block` variant", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "code_block",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph LR\n  X-->Y" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual({
      type: "doc",
      content: [
        {
          type: "mermaid",
          attrs: { code: "graph LR\n  X-->Y" },
        },
      ],
    });
  });

  it("treats the language attribute case-insensitively", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "Mermaid" },
          content: [{ type: "text", text: "graph TD\nA-->B" }],
        },
      ],
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<{ type: string; attrs: { code: string } }>;
    };
    expect(result.content[0].type).toBe("mermaid");
    expect(result.content[0].attrs.code).toBe("graph TD\nA-->B");
  });

  it("does not touch non-mermaid code blocks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "console.log()" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual(doc);
  });

  it("does not touch code blocks without a language attribute", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "graph TD" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual(doc);
  });

  it("concatenates multiple text nodes within a code block", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [
            { type: "text", text: "graph TD" },
            { type: "hardBreak" },
            { type: "text", text: "A-->B" },
          ],
        },
      ],
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<{ type: string; attrs: { code: string } }>;
    };
    expect(result.content[0]).toEqual({
      type: "mermaid",
      attrs: { code: "graph TD\nA-->B" },
    });
  });

  it("produces an empty code string when the code block has no children", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual({
      type: "doc",
      content: [
        {
          type: "mermaid",
          attrs: { code: "" },
        },
      ],
    });
  });

  it("strips trailing newlines from the extracted source", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD\nA-->B\n\n" }],
        },
      ],
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<{ attrs: { code: string } }>;
    };
    expect(result.content[0].attrs.code).toBe("graph TD\nA-->B");
  });

  it("transforms mermaid code blocks nested inside lists", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "codeBlock",
                  attrs: { language: "mermaid" },
                  content: [{ type: "text", text: "graph TD" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<{
        content: Array<{
          content: Array<{ type: string; attrs?: { code?: string } }>;
        }>;
      }>;
    };
    expect(result.content[0].content[0].content[0]).toEqual({
      type: "mermaid",
      attrs: { code: "graph TD" },
    });
  });

  it("returns unchanged content when no mermaid block exists", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "plain text" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toEqual(doc);
  });

  it("does not mutate the input object", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD" }],
        },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(doc));

    transformMermaidCodeBlocksInContent(doc);

    expect(doc).toEqual(snapshot);
  });

  // ディープクローンを削除し、変更が無いノードは同一参照のまま返す構造共有方式に
  // した（gemini-code-assist のレビュー、PR #946 高優先）。大きなドキュメントで
  // 不要なメモリ確保と GC 圧を避けるため、参照同値性で検証する。
  // The transform now returns the original reference when nothing changes
  // (structural sharing) instead of deep-cloning up front, per the high-priority
  // gemini-code-assist review on PR #946. Verify via reference equality.
  it("returns the same reference when there is no mermaid block", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "plain" }],
        },
      ],
    };

    expect(transformMermaidCodeBlocksInContent(doc)).toBe(doc);
  });

  it("shares structure for unaffected sibling subtrees", () => {
    const untouchedList = {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "item" }],
            },
          ],
        },
      ],
    };
    const doc = {
      type: "doc",
      content: [
        untouchedList,
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: "graph TD" }],
        },
      ],
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<unknown>;
    };
    // ルートと content 配列は新しく作られるが、変更されていない兄弟は同一参照を共有する。
    // The root and content array are reallocated, but unchanged siblings share refs.
    expect(result).not.toBe(doc);
    expect(result.content[0]).toBe(untouchedList);
  });

  it("transforms multiple mermaid code blocks in the same document", () => {
    const doc = {
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
    };

    const result = transformMermaidCodeBlocksInContent(doc) as unknown as {
      content: Array<{ type: string; attrs?: { code?: string } }>;
    };
    expect(result.content[0]).toEqual({ type: "mermaid", attrs: { code: "graph TD" } });
    expect(result.content[1].type).toBe("paragraph");
    expect(result.content[2]).toEqual({
      type: "mermaid",
      attrs: { code: "sequenceDiagram" },
    });
  });
});
