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
  textToJson,
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
    heading.setAttribute("level", 2);
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

describe("textToJson (paragraph wrapper)", () => {
  it("wraps inline nodes in a paragraph for legacy callers", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("test");
    const text = new Y.XmlText();
    fragment.insert(0, [text]);
    text.insert(0, "Plain text");

    const result = textToJson(text);

    expect(result).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Plain text" }],
    });
  });
});
