/**
 * `applyWikiLinkMarksToYDoc` の単体テスト。
 *
 * Unit tests for the server-side WikiLink normalizer that replaces the
 * client's `applyWikiLinkMarksToEditor` post-sync helper (Issue #880
 * Phase B regression — y-prosemirror `unexpectedCase` on multi-mark
 * dispatch in collaborative mode).
 *
 * 検証観点 / Coverage:
 * - 未 mark の `[[Title]]` を `wikiLink` mark に昇格させる
 * - 既存 mark を二重 mark しない（冪等）
 * - インラインコード / コードブロック内はスキップ
 * - 空タイトルはスキップ
 * - 1 段落内の複数マッチ / 複数段落の同時処理
 * - 既存の他 mark（`bold` 等）を温存する
 * - `marksApplied` カウンタが返る
 * - `format` のみを使うためテキスト長は不変
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import { applyWikiLinkMarksToYDoc } from "../../services/ydocWikiLinkNormalizer.js";

/**
 * 1 段落 (`paragraph`) + 1 つの Y.XmlText で構成される最小ドキュメントを組む。
 * Build a minimal Tiptap-like Y.Doc with one paragraph and one Y.XmlText.
 */
function buildParagraphDoc(
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
 * 指定したノード名のブロック (`codeBlock` 等) + 内側に 1 つの Y.XmlText を構成する。
 * Build a Y.Doc whose top-level child is `nodeName` (e.g. `codeBlock`) with a
 * single Y.XmlText inside it.
 */
function buildContainerDoc(
  nodeName: string,
  segments: Array<{ insert: string; attributes?: Record<string, unknown> }>,
): { doc: Y.Doc; text: Y.XmlText } {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const container = new Y.XmlElement(nodeName);
  fragment.insert(0, [container]);
  const text = new Y.XmlText();
  container.insert(0, [text]);
  for (const segment of segments) {
    text.insert(text.length, segment.insert, segment.attributes);
  }
  return { doc, text };
}

/**
 * Y.XmlText のプレーンテキストを取り出すヘルパー。`toJSON()` は mark を XML
 * 要素として直列化するため文字列比較には使えない。
 *
 * Extract plain text from a Y.XmlText. `toJSON()` serializes marks as XML
 * elements, so reconstruct the string from the delta instead.
 */
function plainText(text: Y.XmlText): string {
  const delta = text.toDelta() as Array<{ insert: unknown }>;
  return delta.map((item) => (typeof item.insert === "string" ? item.insert : "")).join("");
}

describe("applyWikiLinkMarksToYDoc", () => {
  it("promotes a plain `[[Title]]` segment to a wikiLink mark", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "see [[Foo]] for details" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(1);
    expect(plainText(text)).toBe("see [[Foo]] for details");
    expect(text.toDelta()).toEqual([
      { insert: "see " },
      {
        insert: "[[Foo]]",
        attributes: {
          wikiLink: { title: "Foo", exists: false, referenced: false, targetId: null },
        },
      },
      { insert: " for details" },
    ]);
  });

  it("does not double-mark an already-marked wikiLink segment", () => {
    const { doc, text } = buildParagraphDoc([
      {
        insert: "[[Foo]]",
        attributes: {
          wikiLink: { title: "Foo", exists: true, referenced: false, targetId: "page-1" },
        },
      },
    ]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    // 既存属性 (exists=true, targetId) を温存することがコア要件。
    // Existing attributes (exists=true, targetId) must be preserved verbatim.
    expect(text.toDelta()).toEqual([
      {
        insert: "[[Foo]]",
        attributes: {
          wikiLink: { title: "Foo", exists: true, referenced: false, targetId: "page-1" },
        },
      },
    ]);
  });

  it("skips `[[Title]]` inside an inline code mark", () => {
    // Y.XmlText の `insert` は直前のセグメントの attributes を継承する
    // ことがあるため、`format` で `code` mark を `[[Foo]]` の範囲だけに
    // 明示的に付けたうえで検証する。
    // Y.XmlText.insert may inherit the preceding segment's attributes, so
    // we set `code: true` explicitly via `format` only on the `[[Foo]]`
    // span.
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph]);
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    text.insert(0, "before [[Foo]] after");
    text.format(7, 7, { code: true }); // mark only "[[Foo]]"

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    // wikiLink 属性は付与されないこと、テキストが不変であることを確認。
    // Verify no wikiLink attr appears and the plain text is intact.
    const delta = text.toDelta() as Array<{
      insert: unknown;
      attributes?: Record<string, unknown>;
    }>;
    expect(delta.some((s) => s.attributes?.wikiLink)).toBe(false);
    const reconstructed = delta.map((s) => (typeof s.insert === "string" ? s.insert : "")).join("");
    expect(reconstructed).toBe("before [[Foo]] after");
  });

  it("skips text inside a `codeBlock`", () => {
    const { doc, text } = buildContainerDoc("codeBlock", [{ insert: "see [[Foo]] inside code" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(text.toDelta()).toEqual([{ insert: "see [[Foo]] inside code" }]);
  });

  it("skips text inside a `code_block` (snake_case alias)", () => {
    const { doc, text } = buildContainerDoc("code_block", [{ insert: "[[Foo]] still literal" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(text.toDelta()).toEqual([{ insert: "[[Foo]] still literal" }]);
  });

  it("skips text inside `executableCodeBlock`", () => {
    const { doc, text } = buildContainerDoc("executableCodeBlock", [{ insert: "[[Foo]]" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(text.toDelta()).toEqual([{ insert: "[[Foo]]" }]);
  });

  it("skips empty title `[[   ]]`", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "garbage [[   ]] here" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(plainText(text)).toBe("garbage [[   ]] here");
  });

  it("marks multiple `[[Title]]` patterns in the same paragraph", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "see [[A]] and [[B]]" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(2);
    expect(text.toDelta()).toEqual([
      { insert: "see " },
      {
        insert: "[[A]]",
        attributes: {
          wikiLink: { title: "A", exists: false, referenced: false, targetId: null },
        },
      },
      { insert: " and " },
      {
        insert: "[[B]]",
        attributes: {
          wikiLink: { title: "B", exists: false, referenced: false, targetId: null },
        },
      },
    ]);
  });

  it("marks `[[Title]]` across multiple paragraphs", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const paragraph1 = new Y.XmlElement("paragraph");
    const paragraph2 = new Y.XmlElement("paragraph");
    fragment.insert(0, [paragraph1, paragraph2]);
    const text1 = new Y.XmlText();
    const text2 = new Y.XmlText();
    paragraph1.insert(0, [text1]);
    paragraph2.insert(0, [text2]);
    text1.insert(0, "Has [[One]] mark");
    text2.insert(0, "And [[Two]] here");

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(2);
    expect(text1.toDelta()).toEqual([
      { insert: "Has " },
      {
        insert: "[[One]]",
        attributes: {
          wikiLink: { title: "One", exists: false, referenced: false, targetId: null },
        },
      },
      { insert: " mark" },
    ]);
    expect(text2.toDelta()).toEqual([
      { insert: "And " },
      {
        insert: "[[Two]]",
        attributes: {
          wikiLink: { title: "Two", exists: false, referenced: false, targetId: null },
        },
      },
      { insert: " here" },
    ]);
  });

  it("preserves co-existing marks (e.g. `bold`) on the matched range", () => {
    const { doc, text } = buildParagraphDoc([
      { insert: "see [[Foo]] here", attributes: { bold: true } },
    ]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(1);
    // 既存の `bold` は維持されつつ、`[[Foo]]` の範囲だけに wikiLink が追加される。
    // `bold` is preserved everywhere; `wikiLink` is layered on the `[[Foo]]` span only.
    expect(text.toDelta()).toEqual([
      { insert: "see ", attributes: { bold: true } },
      {
        insert: "[[Foo]]",
        attributes: {
          bold: true,
          wikiLink: { title: "Foo", exists: false, referenced: false, targetId: null },
        },
      },
      { insert: " here", attributes: { bold: true } },
    ]);
  });

  it("trims whitespace from the inner title", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "[[  Foo Bar  ]]" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(1);
    const delta = text.toDelta() as Array<{
      insert: unknown;
      attributes?: Record<string, unknown>;
    }>;
    const marked = delta.find((s) => isWikiLinkAttrs(s.attributes));
    expect(marked).toBeDefined();
    expect(marked?.insert).toBe("[[  Foo Bar  ]]");
    expect((marked?.attributes?.wikiLink as Record<string, unknown>).title).toBe("Foo Bar");
  });

  it("returns marksApplied=0 when the document has no `[[Title]]` text", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "plain text without brackets" }]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(plainText(text)).toBe("plain text without brackets");
  });

  it("is idempotent — running twice marks the same number then zero", () => {
    const { doc } = buildParagraphDoc([{ insert: "see [[Foo]] and [[Bar]]" }]);

    const first = applyWikiLinkMarksToYDoc(doc);
    expect(first.marksApplied).toBe(2);

    const second = applyWikiLinkMarksToYDoc(doc);
    expect(second.marksApplied).toBe(0);
  });

  it("does not change plain text length when applying marks", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "long: [[Alpha]] and [[Beta]] and tail" }]);
    const before = plainText(text);

    applyWikiLinkMarksToYDoc(doc);

    expect(plainText(text)).toBe(before);
  });

  it("ignores `[[Title]]` patterns straddling segments with different mark sets", () => {
    // 異なる mark セット (bold/italic) で分断されると、各 Y.XmlText セグメントは
    // 別々に走査されるため、境界をまたぐパターンはマッチしない。クライアントの
    // 既存実装と同じ挙動を維持する。
    // Patterns split across segments with different mark sets are not matched
    // because each segment is scanned independently. Mirrors the existing
    // client-side contract.
    const { doc, text } = buildParagraphDoc([
      { insert: "[[", attributes: { bold: true } },
      { insert: "Foo", attributes: { italic: true } },
      { insert: "]]", attributes: { bold: true } },
    ]);

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(plainText(text)).toBe("[[Foo]]");
  });

  it("emits a single Y.Doc update for the whole batch", () => {
    const { doc } = buildParagraphDoc([{ insert: "[[A]] and [[B]] and [[C]]" }]);
    let updateCount = 0;
    doc.on("update", () => {
      updateCount += 1;
    });

    applyWikiLinkMarksToYDoc(doc);

    // 単一 transact のため observer 通知は 1 回だけ。Hocuspocus の保存 /
    // graph-sync が 1 回だけ走ることを担保する。
    // Single transact => single update => downstream observers (Hocuspocus
    // save, graph sync) fire only once.
    expect(updateCount).toBe(1);
  });

  it("does nothing on an empty Y.Doc", () => {
    const doc = new Y.Doc();
    doc.getXmlFragment("default");

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
  });
});

function isWikiLinkAttrs(attributes: Record<string, unknown> | undefined): boolean {
  if (!attributes) return false;
  const wikiLink = attributes.wikiLink;
  return typeof wikiLink === "object" && wikiLink !== null;
}
