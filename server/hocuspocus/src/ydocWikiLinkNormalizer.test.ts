/**
 * `applyWikiLinkMarksToYDoc` の動作確認テスト。Issue #889 Phase 4 で API 側の
 * 二重実装と client 側 drift 検出テストを削除して以降、本テストが唯一の
 * 自動テストとなる。promote / skip-already-marked / idempotent の 3 経路を
 * 中心にカバーする。
 *
 * Behaviour tests for `applyWikiLinkMarksToYDoc`. Since Issue #889 Phase 4
 * removed the api-side duplicate implementation and the client-side drift
 * detector, this file is now the sole automated coverage. It exercises the
 * three canonical paths: promotion of unmarked literals, skipping marks that
 * already exist, and idempotency on repeat invocation.
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

describe("applyWikiLinkMarksToYDoc", () => {
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
