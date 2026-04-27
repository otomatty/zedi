import { describe, it, expect } from "vitest";
import { tiptapToMarkdown } from "./markdownExport";

describe("tiptapToMarkdown", () => {
  it("converts paragraph to text with newlines", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("Hello world");
    expect(md).toContain("Second line");
  });

  // 本文の見出しは body schema 上 h2–h5（level 2–5）で、`#` 1 個の見出しはページタイトル
  // 入力欄が担う。export ではそれぞれ `##/###/####/#####` を出す。
  // Body headings span schema levels 2–5; the page h1 lives in the title field, so the
  // exporter emits `##/###/####/#####` for the four body levels.
  it("converts body headings (levels 2–5) with matching # prefixes", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H2" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "H3" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "H4" }] },
        { type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: "H5" }] },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("## H2");
    expect(md).toContain("### H3");
    expect(md).toContain("#### H4");
    expect(md).toContain("##### H5");
  });

  // 旧データに残っている level 1 / 欠損 level は最小の本文見出し `##` にフォールバックさせ、
  // ページタイトルの `#` と衝突しないようにする。
  // Legacy heading nodes with level 1 (or a missing level attribute) fall back to `##`,
  // the minimum body-heading level, so they never collide with the page title's `#`.
  it("falls back to `##` when level is missing or below 2 (legacy data)", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Legacy" }] },
        { type: "heading", content: [{ type: "text", text: "NoLevel" }] },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("## Legacy");
    expect(md).toContain("## NoLevel");
    expect(md).not.toMatch(/^# Legacy/m);
    expect(md).not.toMatch(/^# NoLevel/m);
  });

  it("converts bullet list with - markers", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item A" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item B" }] }],
            },
          ],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("- Item A");
    expect(md).toContain("- Item B");
  });

  it("converts ordered list with numbers", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
            },
          ],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("1. First");
    expect(md).toContain("2. Second");
  });

  it("converts blockquote with > prefix", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted text" }] }],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("> Quoted text");
  });

  it("converts code block with ``` delimiters", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "js" },
          content: [{ type: "text", text: "console.log('hi')" }],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("```js");
    expect(md).toContain("console.log('hi')");
    expect(md).toContain("```");
  });

  it("converts horizontal rule to ---", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "horizontalRule" }],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("---");
  });

  it("handles bold, italic, strike, code marks", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: "strike", marks: [{ type: "strike" }] },
            { type: "text", text: "code", marks: [{ type: "code" }] },
          ],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("~~strike~~");
    expect(md).toContain("`code`");
  });

  it("handles link marks with href", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click here",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("[click here](https://example.com)");
  });

  it("handles wikiLink nodes to [[Link Text]]", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "wikiLink", attrs: { title: "My Page" } }],
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("[[My Page]]");
  });

  it("handles image nodes", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "https://example.com/img.png", alt: "Photo" },
        },
      ],
    });
    const md = tiptapToMarkdown(content);
    expect(md).toContain("![Photo](https://example.com/img.png)");
  });

  it("returns empty string for empty input", () => {
    expect(tiptapToMarkdown("")).toBe("");
  });

  it("returns original string for non-JSON input", () => {
    expect(tiptapToMarkdown("plain text content")).toBe("plain text content");
  });
});
