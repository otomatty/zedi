/**
 * `ydocRenameRewrite` の単体テスト。
 * Unit tests for `ydocRenameRewrite` — the pure Y.Doc mutation helper that
 * rewrites WikiLink and tag marks when a page is renamed.
 *
 * Part of issue #726 (Phase 2 rename propagation).
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import { rewriteTitleRefsInDoc } from "../../services/ydocRenameRewrite.js";

/**
 * 最小の Tiptap 風 Y.Doc ツリーを組み立てるヘルパー。`segments` は Y.XmlText
 * の delta と同じ形式で、`attributes` にマーク情報（`wikiLink` / `tag` 等）を入れる。
 *
 * Build a minimal Tiptap-like Y.Doc tree. `segments` follows the Y.XmlText
 * delta format; put mark info (`wikiLink` / `tag`) inside `attributes`.
 */
function buildDocWithParagraph(
  segments: Array<{ insert: string; attributes?: Record<string, unknown> }>,
): { doc: Y.Doc; text: Y.XmlText } {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  fragment.insert(0, [paragraph]);
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  for (const segment of segments) {
    text.insert(text.length, segment.insert, segment.attributes);
  }
  return { doc, text };
}

/**
 * Y.XmlText のプレーンテキストを取り出すテスト用ヘルパー。`toJSON()` は
 * マークを XML 要素として直列化するため、素のテキスト比較には使えない。
 *
 * Extract plain text from a Y.XmlText. `toJSON()` serializes marks as XML
 * elements, so we reconstruct the string from its delta instead.
 */
function plainText(text: Y.XmlText): string {
  const delta = text.toDelta() as Array<{ insert: unknown }>;
  return delta.map((item) => (typeof item.insert === "string" ? item.insert : "")).join("");
}

describe("rewriteTitleRefsInDoc", () => {
  describe("WikiLink marks", () => {
    it("updates mark title and text when the segment text matches the old title", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: { wikiLink: { title: "Foo", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result).toMatchObject({
        wikiLinkMarksUpdated: 1,
        wikiLinkTextUpdated: 1,
        tagMarksUpdated: 0,
        tagTextUpdated: 0,
      });
      expect(text.toDelta()).toEqual([
        {
          insert: "Bar",
          attributes: { wikiLink: { title: "Bar", exists: true, referenced: false } },
        },
      ]);
    });

    it("is case-insensitive and trim-insensitive on the old title match", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "  FOO  ",
          attributes: { wikiLink: { title: "  foo  ", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(result.wikiLinkTextUpdated).toBe(1);
      const delta = text.toDelta();
      expect(delta[0]?.insert).toBe("Bar");
      expect(delta[0]?.attributes?.wikiLink).toEqual({
        title: "Bar",
        exists: true,
        referenced: false,
      });
    });

    it("updates only the mark attribute when the segment text does not match (manual edit)", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Custom label",
          attributes: { wikiLink: { title: "Foo", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(result.wikiLinkTextUpdated).toBe(0);
      expect(text.toDelta()).toEqual([
        {
          insert: "Custom label",
          attributes: { wikiLink: { title: "Bar", exists: true, referenced: false } },
        },
      ]);
    });

    it("does not touch wikiLink marks whose title does not match the old title", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Baz",
          attributes: { wikiLink: { title: "Baz", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(0);
      expect(result.wikiLinkTextUpdated).toBe(0);
      expect(text.toDelta()).toEqual([
        {
          insert: "Baz",
          attributes: { wikiLink: { title: "Baz", exists: true, referenced: false } },
        },
      ]);
    });

    it("rewrites multiple wikiLink occurrences across segments and siblings", () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment("default");
      const p1 = new Y.XmlElement("paragraph");
      const p2 = new Y.XmlElement("paragraph");
      fragment.insert(0, [p1, p2]);

      const t1 = new Y.XmlText();
      p1.insert(0, [t1]);
      // Use `wikiLink: null` to break the formatting inheritance between the
      // two link segments — Y.XmlText inserts otherwise inherit the preceding
      // segment's marks. / Yjs は直前のフォーマットを引き継ぐため、明示的に
      // null を渡して二つの wikiLink 区間を独立させる。
      t1.insert(0, "Foo", { wikiLink: { title: "Foo", exists: true, referenced: false } });
      t1.insert(t1.length, " and ", { wikiLink: null });
      t1.insert(t1.length, "Foo", {
        wikiLink: { title: "Foo", exists: true, referenced: true },
      });

      const t2 = new Y.XmlText();
      p2.insert(0, [t2]);
      t2.insert(0, "related: ");
      t2.insert(t2.length, "Foo", {
        wikiLink: { title: "Foo", exists: true, referenced: false },
      });

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(3);
      expect(result.wikiLinkTextUpdated).toBe(3);
      expect(plainText(t1)).toBe("Bar and Bar");
      expect(plainText(t2)).toBe("related: Bar");
    });
  });

  describe("Tag marks", () => {
    it("updates tag name and text when the segment text matches the old tag", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "foo",
          attributes: { tag: { name: "foo", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.tagMarksUpdated).toBe(1);
      expect(result.tagTextUpdated).toBe(1);
      expect(text.toDelta()).toEqual([
        { insert: "Bar", attributes: { tag: { name: "Bar", exists: true, referenced: false } } },
      ]);
    });

    it("leaves tag marks untouched when the new title is not a valid tag name", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "foo",
          attributes: { tag: { name: "foo", exists: true, referenced: false } },
        },
      ]);

      // Spaces are not valid tag characters — tag cannot follow the rename.
      // スペースはタグ名として無効なので、タグは追従させない。
      const result = rewriteTitleRefsInDoc(doc, "foo", "bar baz");

      expect(result.tagMarksUpdated).toBe(0);
      expect(result.tagTextUpdated).toBe(0);
      expect(text.toDelta()).toEqual([
        { insert: "foo", attributes: { tag: { name: "foo", exists: true, referenced: false } } },
      ]);
    });

    it("handles wikiLink and tag marks in the same paragraph", () => {
      // Explicitly null surrounding marks so neighbouring segments do not
      // inherit each other's formatting (Yjs default behaviour).
      // 隣接セグメント間のフォーマット継承を断ち切るため、null を渡して
      // マーク境界を明示する。
      const { doc, text } = buildDocWithParagraph([
        { insert: "hello " },
        {
          insert: "Foo",
          attributes: { wikiLink: { title: "Foo", exists: true, referenced: false } },
        },
        { insert: " and ", attributes: { wikiLink: null, tag: null } },
        { insert: "foo", attributes: { tag: { name: "foo", exists: true, referenced: false } } },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(result.wikiLinkTextUpdated).toBe(1);
      expect(result.tagMarksUpdated).toBe(1);
      expect(result.tagTextUpdated).toBe(1);
      expect(plainText(text)).toBe("hello Bar and Bar");
    });
  });

  describe("Guards and edge cases", () => {
    it("is a no-op when oldTitle and newTitle normalize to the same value", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: { wikiLink: { title: "Foo", exists: true, referenced: false } },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "  foo  ");

      expect(result.wikiLinkMarksUpdated).toBe(0);
      expect(result.wikiLinkTextUpdated).toBe(0);
      // Content unchanged. 内容に変化がない。
      expect(plainText(text)).toBe("Foo");
    });

    it("is a no-op when either title is empty", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: { wikiLink: { title: "Foo", exists: true, referenced: false } },
        },
      ]);

      expect(rewriteTitleRefsInDoc(doc, "", "Bar").wikiLinkMarksUpdated).toBe(0);
      expect(rewriteTitleRefsInDoc(doc, "Foo", "").wikiLinkMarksUpdated).toBe(0);
      expect(plainText(text)).toBe("Foo");
    });

    it("recurses into nested XmlElement children (e.g. list items)", () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment("default");
      const list = new Y.XmlElement("bulletList");
      fragment.insert(0, [list]);
      const item = new Y.XmlElement("listItem");
      list.insert(0, [item]);
      const para = new Y.XmlElement("paragraph");
      item.insert(0, [para]);
      const text = new Y.XmlText();
      para.insert(0, [text]);
      text.insert(0, "Foo", { wikiLink: { title: "Foo", exists: true, referenced: false } });

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(plainText(text)).toBe("Bar");
    });

    it("returns a zero-result object when the document has no matching refs", () => {
      const { doc } = buildDocWithParagraph([{ insert: "plain text, no marks" }]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result).toEqual({
        wikiLinkMarksUpdated: 0,
        wikiLinkTextUpdated: 0,
        tagMarksUpdated: 0,
        tagTextUpdated: 0,
      });
    });
  });
});
