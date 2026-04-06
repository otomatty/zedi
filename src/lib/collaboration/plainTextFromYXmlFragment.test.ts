import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { extractPlainTextFromYXmlFragment } from "./plainTextFromYXmlFragment";

describe("extractPlainTextFromYXmlFragment", () => {
  it("returns empty string for an empty fragment / 空の fragment では空文字を返す", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    expect(extractPlainTextFromYXmlFragment(fragment)).toBe("");
  });

  it("does not insert newlines between delta ops inside one XmlText (Tiptap marks) / 同一 XmlText 内の複数 op 間に改行を入れない", () => {
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
    const plain = extractPlainTextFromYXmlFragment(doc.getXmlFragment("default")).trim();
    expect(plain).toBe("Hello world!");
    expect(plain).not.toMatch(/Hello\s*\n/);
  });

  it("does not insert newlines between inline XmlText siblings (bold) / インライン境界では改行を入れない", () => {
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
    const plain = extractPlainTextFromYXmlFragment(doc.getXmlFragment("default")).trim();
    expect(plain).not.toMatch(/world\s*\n\s*!/);
    expect(plain.replace(/\s+/g, " ").trim()).toBe("Hello world !");
  });

  it("separates block-level siblings with newlines / ブロック兄弟間は改行で区切る", () => {
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
    const plain = extractPlainTextFromYXmlFragment(doc.getXmlFragment("default")).trim();
    expect(plain).toBe("First\nSecond");
  });
});
