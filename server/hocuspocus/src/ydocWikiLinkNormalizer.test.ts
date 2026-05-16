/**
 * Hocuspocus 側に複製した `applyWikiLinkMarksToYDoc` のスモークテスト。
 * 詳細な受入条件テストは `server/api/src/__tests__/services/ydocWikiLinkNormalizer.test.ts`
 * 側で実施しており、こちらは「複製がリンクできる / 主要 3 パスで期待動作する」
 * のみを最小限で確認する。`src/lib/ydocWikiLinkNormalizerSync.test.ts` がバイト
 * レベル一致を別途保証する。
 *
 * Smoke tests for the Hocuspocus copy of `applyWikiLinkMarksToYDoc`. The
 * exhaustive contract suite lives in the api-side test; this file only
 * checks that the copy compiles, links, and behaves correctly on the three
 * canonical paths (promote, skip-already-marked, idempotent). The drift
 * detector in `src/lib/ydocWikiLinkNormalizerSync.test.ts` guarantees the
 * two implementations stay byte-equivalent.
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";

import { applyWikiLinkMarksToYDoc } from "./ydocWikiLinkNormalizer.js";

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

describe("applyWikiLinkMarksToYDoc (hocuspocus copy)", () => {
  it("promotes unmarked `[[Title]]` to a wikiLink mark", () => {
    const { doc, text } = buildParagraphDoc([{ insert: "see [[Foo]] now" }]);
    const result = applyWikiLinkMarksToYDoc(doc);
    expect(result.marksApplied).toBe(1);
    const delta = text.toDelta() as Array<{
      insert: unknown;
      attributes?: Record<string, unknown>;
    }>;
    const marked = delta.find((s) => s.attributes?.wikiLink);
    expect(marked).toBeDefined();
    expect((marked?.attributes?.wikiLink as { title: string }).title).toBe("Foo");
  });

  it("is idempotent across repeated invocations", () => {
    const { doc } = buildParagraphDoc([{ insert: "see [[A]] and [[B]]" }]);
    expect(applyWikiLinkMarksToYDoc(doc).marksApplied).toBe(2);
    expect(applyWikiLinkMarksToYDoc(doc).marksApplied).toBe(0);
  });

  it("does not touch text inside a codeBlock", () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("default");
    const block = new Y.XmlElement("codeBlock");
    fragment.insert(0, [block]);
    const text = new Y.XmlText();
    block.insert(0, [text]);
    text.insert(0, "[[NotALink]]");

    const result = applyWikiLinkMarksToYDoc(doc);

    expect(result.marksApplied).toBe(0);
    expect(text.toDelta()).toEqual([{ insert: "[[NotALink]]" }]);
  });
});
