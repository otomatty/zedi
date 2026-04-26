import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildContentPreview, extractTextFromYXml } from "./extractPlainTextFromYXml.js";

describe("extractTextFromYXml", () => {
  it("returns empty string for an empty fragment / 空の fragment では空文字を返す", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    expect(extractTextFromYXml(fragment)).toBe("");
  });

  it("extracts plain text from a simple paragraph / 単純なパラグラフからテキストを抽出する", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const p = new Y.XmlElement("paragraph");
      fragment.push([p]);
      const t = new Y.XmlText();
      t.insert(0, "Hello world");
      p.push([t]);
    });
    expect(extractTextFromYXml(doc.getXmlFragment("default")).trim()).toBe("Hello world");
  });

  it("does not insert a newline inside a paragraph between inline bold and following text", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const paragraph = new Y.XmlElement("paragraph");
      fragment.push([paragraph]);
      const t1 = new Y.XmlText();
      t1.insert(0, "Hello ");
      paragraph.push([t1]);
      const bold = new Y.XmlElement("bold");
      paragraph.push([bold]);
      const tBold = new Y.XmlText();
      tBold.insert(0, "world");
      bold.push([tBold]);
      const t2 = new Y.XmlText();
      t2.insert(0, "!");
      paragraph.push([t2]);
    });

    const plain = extractTextFromYXml(doc.getXmlFragment("default")).trim();
    expect(plain).not.toMatch(/world\s*\n\s*!/);
    expect(plain.replace(/\s+/g, " ").trim()).toBe("Hello world !");
  });

  it("separates block-level paragraphs with newlines", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const p1 = new Y.XmlElement("paragraph");
      fragment.push([p1]);
      const a = new Y.XmlText();
      a.insert(0, "First");
      p1.push([a]);
      const p2 = new Y.XmlElement("paragraph");
      fragment.push([p2]);
      const b = new Y.XmlText();
      b.insert(0, "Second");
      p2.push([b]);
    });

    const plain = extractTextFromYXml(doc.getXmlFragment("default")).trim();
    expect(plain).toMatch(/First/);
    expect(plain).toMatch(/Second/);
    expect(plain.includes("First") && plain.includes("Second")).toBe(true);
    expect(/\n/.test(plain)).toBe(true);
  });

  it("strips formatting attributes from XmlText delta (Tiptap marks) / XmlText の書式属性を除去する", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const p = new Y.XmlElement("paragraph");
      fragment.push([p]);
      const t = new Y.XmlText();
      t.insert(0, "Hello ");
      t.insert(6, "world", { bold: true });
      t.insert(11, "!");
      p.push([t]);
    });
    const plain = extractTextFromYXml(doc.getXmlFragment("default")).trim();
    expect(plain).toBe("Hello world!");
    expect(plain).not.toContain("<bold>");
    expect(plain).not.toContain("</bold>");
  });

  it("strips italic and other mark attributes / italic 等の書式属性も除去する", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const p = new Y.XmlElement("paragraph");
      fragment.push([p]);
      const t = new Y.XmlText();
      t.insert(0, "normal ");
      t.insert(7, "italic", { italic: true });
      t.insert(13, " ");
      t.insert(14, "bold-italic", { bold: true, italic: true });
      p.push([t]);
    });
    const plain = extractTextFromYXml(doc.getXmlFragment("default")).trim();
    expect(plain).toBe("normal italic bold-italic");
    expect(plain).not.toContain("<italic>");
    expect(plain).not.toContain("<bold>");
  });

  it("handles nested elements (e.g. list items) / ネストされた要素を処理する", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      const fragment = doc.getXmlFragment("default");
      const list = new Y.XmlElement("bulletList");
      const item1 = new Y.XmlElement("listItem");
      const p1 = new Y.XmlElement("paragraph");
      const t1 = new Y.XmlText();
      t1.insert(0, "Item 1");
      p1.push([t1]);
      item1.push([p1]);

      const item2 = new Y.XmlElement("listItem");
      const p2 = new Y.XmlElement("paragraph");
      const t2 = new Y.XmlText();
      t2.insert(0, "Item 2");
      p2.push([t2]);
      item2.push([p2]);

      list.push([item1, item2]);
      fragment.push([list]);
    });
    const plain = extractTextFromYXml(doc.getXmlFragment("default"));
    expect(plain).toContain("Item 1");
    expect(plain).toContain("Item 2");
  });
});

describe("buildContentPreview", () => {
  it("collapses whitespace and truncates", () => {
    expect(buildContentPreview("  a \n b  ")).toBe("a b");
    const long = "x".repeat(200);
    const prev = buildContentPreview(long);
    expect(prev.endsWith("...")).toBe(true);
    expect(prev.length).toBeLessThanOrEqual(120);
  });
});
