/**
 * Y.Doc → TipTap JSON 変換ロジックのテスト
 * Tests for Y.Doc to TipTap JSON conversion logic
 */
import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  yXmlFragmentToTiptapJson,
  yXmlElementToJson,
  textToInlineNodes,
} from "../yDocToTiptapJson";

describe("yXmlFragmentToTiptapJson", () => {
  it("returns doc with empty paragraph for empty fragment", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");

    const result = yXmlFragmentToTiptapJson(fragment);

    expect(result).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("converts fragment with a paragraph containing text", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, "Hello, world!");
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);

    const result = yXmlFragmentToTiptapJson(fragment);

    expect(result.type).toBe("doc");
    expect(result.content).toBeInstanceOf(Array);
    const content = result.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Hello, world!" }],
    });
  });

  it("converts nested elements (heading with text) — inline text, not nested paragraph", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const heading = new Y.XmlElement("heading");
    // Tiptap stores heading level as a number; Y typings expect string attrs.
    heading.setAttribute("level", 2 as unknown as string);
    const text = new Y.XmlText();
    text.insert(0, "Title");
    heading.insert(0, [text]);
    fragment.insert(0, [heading]);

    const result = yXmlFragmentToTiptapJson(fragment);

    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }],
    });
  });
});

describe("yXmlElementToJson", () => {
  it("returns null for unsupported types", () => {
    const doc = new Y.Doc();
    const map = doc.getMap("test");
    const result = yXmlElementToJson(map as unknown as Y.XmlElement);
    expect(result).toBeNull();
  });

  it("converts XmlElement with attributes", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const el = new Y.XmlElement("codeBlock");
    fragment.insert(0, [el]);
    el.setAttribute("language", "typescript");

    const result = yXmlElementToJson(el);

    expect(result).toEqual({
      type: "codeBlock",
      attrs: { language: "typescript" },
    });
  });

  it("converts XmlElement without attributes or children", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const el = new Y.XmlElement("bulletList");
    fragment.insert(0, [el]);

    const result = yXmlElementToJson(el);

    expect(result).toEqual({ type: "bulletList" });
  });
});

describe("textToInlineNodes", () => {
  it("returns empty array for empty text", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);

    expect(textToInlineNodes(text)).toEqual([]);
  });

  it("converts plain text to inline text nodes", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "Plain text");

    expect(textToInlineNodes(text)).toEqual([{ type: "text", text: "Plain text" }]);
  });

  it("converts text with bold mark", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "Bold", { bold: true });

    expect(textToInlineNodes(text)).toEqual([
      {
        type: "text",
        text: "Bold",
        marks: [{ type: "bold" }],
      },
    ]);
  });

  it("converts text with non-boolean mark attributes", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "Link", { link: { href: "https://example.com" } });

    const nodes = textToInlineNodes(text);
    expect(nodes[0]?.marks).toEqual([{ type: "link", attrs: { href: "https://example.com" } }]);
  });
});

describe("snapshots that contain content removed with the desktop app", () => {
  const fragmentWith = (...nodes: Y.XmlElement[]) => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    fragment.insert(0, nodes);
    return fragment;
  };
  const withText = (el: Y.XmlElement, value: string, attributes: Record<string, unknown> = {}) => {
    const text = new Y.XmlText();
    text.insert(0, value, attributes);
    el.insert(0, [text]);
    return el;
  };

  it("shows an executable code block as a code block, with its output after it", () => {
    const cell = new Y.XmlElement("executableCodeBlock");
    cell.setAttribute("language", "python");
    cell.setAttribute("stdout", "1");
    withText(cell, "print(1)");

    expect(yXmlFragmentToTiptapJson(fragmentWith(cell)).content).toEqual([
      {
        type: "codeBlock",
        attrs: { language: "python" },
        content: [{ type: "text", text: "print(1)" }],
      },
      { type: "codeBlock", attrs: { language: "text" }, content: [{ type: "text", text: "1" }] },
    ]);
  });

  it("shows an MCP resource as a paragraph naming it, with its fetched content after it", () => {
    const resource = new Y.XmlElement("mcpResource");
    resource.setAttribute("server", "github");
    resource.setAttribute("resource", "repo://zedi/README.md");
    resource.setAttribute("resolvedContent", "# Zedi");

    expect(yXmlFragmentToTiptapJson(fragmentWith(resource)).content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "MCP: github repo://zedi/README.md" }] },
      {
        type: "codeBlock",
        attrs: { language: "text" },
        content: [{ type: "text", text: "# Zedi" }],
      },
    ]);
  });

  it("drops file reference marks and keeps the text", () => {
    const paragraph = withText(new Y.XmlElement("paragraph"), "src/a.ts", {
      "fileReference--AbCd1234": { path: "src/a.ts" },
      bold: true,
    });

    expect(yXmlFragmentToTiptapJson(fragmentWith(paragraph)).content).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "src/a.ts", marks: [{ type: "bold" }] }],
      },
    ]);
  });
});
