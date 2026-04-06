import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildContentPreview, extractTextFromYXml } from "./extractPlainTextFromYXml.js";

describe("extractTextFromYXml", () => {
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
});

describe("buildContentPreview", () => {
  it("collapses whitespace and truncates", () => {
    expect(buildContentPreview("  a \n b  ")).toBe("a b");
    const long = "x".repeat(200);
    const prev = buildContentPreview(long);
    expect(prev.endsWith("...")).toBe(true);
    expect(prev.length).toBeLessThanOrEqual(124);
  });
});
