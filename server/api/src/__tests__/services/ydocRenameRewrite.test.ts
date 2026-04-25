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

  describe("targetId-based matching (issue #737)", () => {
    const RENAMED_PAGE_ID = "11111111-aaaa-bbbb-cccc-000000000001";
    const OTHER_PAGE_ID = "22222222-aaaa-bbbb-cccc-000000000002";

    it("rewrites a wikiLink mark whose targetId matches renamedPageId", () => {
      // 案 A: ID 一致で書き換え対象を特定する。タイトル一致だけに頼らないことで、
      // 同名ページが別 ID で共存していても正しい一方だけを書き換えられる。
      // Approach A: id-matching pinpoints which mark to rewrite, so that
      // same-titled pages with different ids do not interfere.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false, targetId: RENAMED_PAGE_ID },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar", { renamedPageId: RENAMED_PAGE_ID });

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(result.wikiLinkTextUpdated).toBe(1);
      const delta = text.toDelta();
      expect(delta[0]?.insert).toBe("Bar");
      expect(delta[0]?.attributes?.wikiLink).toEqual({
        title: "Bar",
        exists: true,
        referenced: false,
        targetId: RENAMED_PAGE_ID,
      });
    });

    it("does NOT rewrite a wikiLink mark whose title matches but targetId points elsewhere", () => {
      // 同名ページの誤書き換え (issue #737) を防ぐ核心ケース。タイトルは一致
      // するが `targetId` が別ページを指しているため、書き換えてはいけない。
      // The exact issue #737 scenario: same title but a different `targetId`.
      // The mark refers to a different page and must stay untouched.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false, targetId: OTHER_PAGE_ID },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar", { renamedPageId: RENAMED_PAGE_ID });

      expect(result.wikiLinkMarksUpdated).toBe(0);
      expect(result.wikiLinkTextUpdated).toBe(0);
      expect(text.toDelta()).toEqual([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false, targetId: OTHER_PAGE_ID },
          },
        },
      ]);
    });

    it("falls back to title matching for marks without targetId (lazy migration)", () => {
      // 旧データ・未解決マークでは `targetId` が無いので、従来通りタイトル一致
      // で書き換える。これにより既存 Y.Doc を移行せずに済む。
      // Lazy migration: marks without `targetId` keep matching by title so
      // existing Y.Docs do not require an upfront migration pass.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar", { renamedPageId: RENAMED_PAGE_ID });

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(result.wikiLinkTextUpdated).toBe(1);
      const delta = text.toDelta();
      expect(delta[0]?.insert).toBe("Bar");
      expect(delta[0]?.attributes?.wikiLink).toMatchObject({ title: "Bar" });
    });

    it("treats empty-string targetId as missing and falls back to title match", () => {
      // `data-target-id=""` が parseHTML されたケースなど、空文字 `targetId` を
      // 「ID 無し」と等価に扱う。これも lazy migration 経路に倒す。
      // Empty-string `targetId` (e.g. parsed from a stray empty data-attr)
      // is treated as id-less so it lands on the legacy fallback path.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false, targetId: "" },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar", { renamedPageId: RENAMED_PAGE_ID });

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(plainText(text)).toBe("Bar");
    });

    it("rewrites tag marks by targetId match and skips same-name tags pointing elsewhere", () => {
      // タグマークも同様。同名タグが別ページに紐付いている場合は触らない。
      // Tag marks honour the same id-strict rule: same name on a different
      // page id must not be rewritten.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "foo",
          attributes: {
            tag: { name: "foo", exists: true, referenced: false, targetId: RENAMED_PAGE_ID },
          },
        },
        { insert: " ", attributes: { tag: null, wikiLink: null } },
        {
          insert: "foo",
          attributes: {
            tag: { name: "foo", exists: true, referenced: false, targetId: OTHER_PAGE_ID },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "foo", "bar", { renamedPageId: RENAMED_PAGE_ID });

      expect(result.tagMarksUpdated).toBe(1);
      expect(result.tagTextUpdated).toBe(1);
      // 1 つ目の tag は `bar` に書き換わり、2 つ目は `foo` のまま残る。
      // First tag becomes `bar`; the second one stays `foo`.
      expect(plainText(text)).toBe("bar foo");
    });

    it("skips marks that carry a targetId when renamedPageId is omitted (cannot verify)", () => {
      // `renamedPageId` を渡さない呼び出しで、マークに `targetId` がある場合は
      // 同名ページとの判別ができないため安全側に倒して書き換えない。
      // `targetId` 無しのマークだけが従来通りタイトル一致でフォールバックする。
      // Without `renamedPageId` we cannot verify a mark's `targetId`, so the
      // safe default is to skip rewriting it (avoids the same-title bug
      // regressing for any legacy caller). Marks without `targetId` still
      // fall back to title matching as before.
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false, targetId: OTHER_PAGE_ID },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(0);
      expect(plainText(text)).toBe("Foo");
    });

    it("keeps rewriting id-less marks by title even when renamedPageId is omitted", () => {
      // `renamedPageId` 無しでも、`targetId` を持たないマークは従来通り
      // タイトル一致で書き換える（後方互換）。
      // Marks without `targetId` continue to use title-fallback rewriting
      // even when `renamedPageId` is omitted (backward compat).
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "Foo",
          attributes: {
            wikiLink: { title: "Foo", exists: true, referenced: false },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(plainText(text)).toBe("Bar");
    });

    // タグマーク版の fallback 挙動パリティ。同じ 2 ケースを `tag` マーク側でも
    // 保証する（CodeRabbit レビュー指摘）。`tag` 単独でリグレッションが
    // 入らないようテスト面でも `wikiLink` と同等の網を張る。
    // Tag-mark parity for the two `renamedPageId`-omitted fallback branches
    // (CodeRabbit review). Mirrors the wikiLink coverage so a tag-only
    // regression cannot slip past the suite.
    it("skips tag marks that carry a targetId when renamedPageId is omitted", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "foo",
          attributes: {
            tag: { name: "foo", exists: true, referenced: false, targetId: OTHER_PAGE_ID },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "foo", "bar");

      expect(result.tagMarksUpdated).toBe(0);
      expect(result.tagTextUpdated).toBe(0);
      expect(plainText(text)).toBe("foo");
    });

    it("keeps rewriting id-less tag marks by name even when renamedPageId is omitted", () => {
      const { doc, text } = buildDocWithParagraph([
        {
          insert: "foo",
          attributes: {
            tag: { name: "foo", exists: true, referenced: false },
          },
        },
      ]);

      const result = rewriteTitleRefsInDoc(doc, "foo", "bar");

      expect(result.tagMarksUpdated).toBe(1);
      expect(result.tagTextUpdated).toBe(1);
      expect(plainText(text)).toBe("bar");
    });
  });

  describe("Backward-compat for legacy 4-arg fragmentName form", () => {
    // 旧 API では第 4 引数が `fragmentName: string` だった。文字列をそのまま
    // 受け取って `{ fragmentName }` として解釈できることを固定する
    // （CodeRabbit レビュー指摘）。これにより、issue #737 以前のスナップショット
    // から拾い上げられた呼び出し元が静かに既定フラグメントへ書き換わる事故
    // を防ぐ。
    // Pre-issue-#737 callers passed the fourth arg as a `fragmentName`
    // string. Lock in that the function still accepts that shape so legacy
    // callers do not silently retarget the default fragment (CodeRabbit).
    it("treats a string fourth argument as fragmentName", () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment("custom");
      const paragraph = new Y.XmlElement("paragraph");
      fragment.insert(0, [paragraph]);
      const text = new Y.XmlText();
      paragraph.insert(0, [text]);
      text.insert(0, "Foo", { wikiLink: { title: "Foo", exists: true, referenced: false } });

      const result = rewriteTitleRefsInDoc(doc, "Foo", "Bar", "custom");

      expect(result.wikiLinkMarksUpdated).toBe(1);
      expect(plainText(text)).toBe("Bar");
    });

    it("does not touch the default fragment when only `custom` is asked for", () => {
      // 旧 API の呼び出しがオプション形へ自動変換され、誤って default フラグ
      // メントを書き換えてしまわないことを担保する。
      // Guard against a regression where the legacy form is parsed as
      // options and silently rewrites the default fragment instead.
      const doc = new Y.Doc();
      const defaultFragment = doc.getXmlFragment("default");
      const defaultPara = new Y.XmlElement("paragraph");
      defaultFragment.insert(0, [defaultPara]);
      const defaultText = new Y.XmlText();
      defaultPara.insert(0, [defaultText]);
      defaultText.insert(0, "Foo", {
        wikiLink: { title: "Foo", exists: true, referenced: false },
      });

      const customFragment = doc.getXmlFragment("custom");
      const customPara = new Y.XmlElement("paragraph");
      customFragment.insert(0, [customPara]);
      const customText = new Y.XmlText();
      customPara.insert(0, [customText]);
      customText.insert(0, "Foo", {
        wikiLink: { title: "Foo", exists: true, referenced: false },
      });

      rewriteTitleRefsInDoc(doc, "Foo", "Bar", "custom");

      // 既定フラグメントは触らず、`custom` のみが書き換わる。
      // The default fragment is left untouched; only `custom` rewrites.
      expect(plainText(defaultText)).toBe("Foo");
      expect(plainText(customText)).toBe("Bar");
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
