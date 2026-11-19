import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { extractPlainText, toPreview } from "./plainText";

function buildDoc(): Y.Doc {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const heading = new Y.XmlElement("heading");
  heading.setAttribute("level", "1");
  heading.insert(0, [new Y.XmlText("見出し")]);
  const paragraph = new Y.XmlElement("paragraph");
  const text = new Y.XmlText();
  text.insert(0, "太字", { bold: true });
  text.insert(2, "と通常");
  const link = new Y.XmlElement("wikiLink");
  link.setAttribute("title", "Hono");
  paragraph.insert(0, [text, link, new Y.XmlText(" です")]);
  const list = new Y.XmlElement("bulletList");
  const item = new Y.XmlElement("listItem");
  const itemParagraph = new Y.XmlElement("paragraph");
  itemParagraph.insert(0, [new Y.XmlText("項目")]);
  item.insert(0, [itemParagraph]);
  list.insert(0, [item]);
  fragment.insert(0, [heading, paragraph, list]);
  return doc;
}

describe("extractPlainText", () => {
  it("joins block text with newlines, drops formatting and renders WikiLinks by title", () => {
    expect(extractPlainText(buildDoc())).toBe("見出し\n太字と通常[[Hono]] です\n項目");
  });

  it("returns an empty string for an empty document", () => {
    expect(extractPlainText(new Y.Doc())).toBe("");
  });
});

describe("toPreview", () => {
  it("collapses whitespace and truncates to the limit with an ellipsis", () => {
    expect(toPreview("a\n\n b   c", 10)).toBe("a b c");
    expect(toPreview("一二三四五六", 4)).toBe("一二三…");
  });
});
