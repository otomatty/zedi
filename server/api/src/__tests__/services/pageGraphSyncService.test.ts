/**
 * `pageGraphSyncService` の pure helper を対象にしたユニットテスト。
 * Issue #880 Phase C：Y.Doc からの参照抽出と (links/ghosts) プランニング部分を
 * DB 非依存で検証する。実 DB を介する `syncPageGraphFromYDoc` は別途
 * 統合テストでカバーする想定。
 *
 * Unit tests for the pure helpers of `pageGraphSyncService` (issue #880
 * Phase C). The DB-touching wrapper `syncPageGraphFromYDoc` is exercised by
 * separate integration tests; these unit tests guard the extraction/planning
 * logic in isolation.
 */

import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { __test_only } from "../../services/pageGraphSyncService.js";

const { extractRefsFromYDoc, planBucket } = __test_only;

/**
 * 最小の Tiptap 風 Y.Doc を作るヘルパー。
 * Build a Y.Doc with a single paragraph containing the given delta segments.
 */
function buildDoc(
  segments: Array<{ insert: string; attributes?: Record<string, unknown> }>,
): Y.Doc {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  fragment.insert(0, [paragraph]);
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  for (const seg of segments) {
    text.insert(text.length, seg.insert, seg.attributes);
  }
  return doc;
}

describe("extractRefsFromYDoc", () => {
  it("returns empty refs for a doc without wiki/tag marks", () => {
    const doc = buildDoc([{ insert: "plain text" }]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(0);
    expect(refs.tagRefs).toHaveLength(0);
  });

  it("extracts a single WikiLink ref", () => {
    const doc = buildDoc([
      {
        insert: "Foo",
        attributes: { wikiLink: { title: "Foo", exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(1);
    expect(refs.wikiRefs[0]).toEqual({
      normalizedTitle: "foo",
      displayTitle: "Foo",
      targetId: null,
    });
  });

  it("preserves the user-facing spelling but normalizes the lookup key", () => {
    // 大小文字・前後空白の差分は正規化キーで吸収しつつ、表示テキストは保持。
    // The lookup key collapses case + whitespace; the display spelling is
    // preserved (used for ghost rows).
    const doc = buildDoc([
      {
        insert: "  Foo  ",
        attributes: { wikiLink: { title: "  FOO  ", exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs[0]?.normalizedTitle).toBe("foo");
    expect(refs.wikiRefs[0]?.displayTitle).toBe("FOO");
  });

  it("captures targetId when the mark carries one", () => {
    const doc = buildDoc([
      {
        insert: "Foo",
        attributes: {
          wikiLink: {
            title: "Foo",
            exists: true,
            referenced: false,
            targetId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          },
        },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs[0]?.targetId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("collapses duplicate WikiLink references with the same id+title", () => {
    // 同じタイトル + targetId が複数箇所に現れても 1 件にまとまる。
    // Repeated `(title, targetId)` collapses to one ref.
    const doc = buildDoc([
      {
        insert: "Foo",
        attributes: { wikiLink: { title: "Foo", exists: false, referenced: false } },
      },
      { insert: " and " },
      {
        insert: "foo",
        attributes: { wikiLink: { title: "foo", exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(1);
  });

  it("keeps a same-titled mark with a different targetId as a separate ref", () => {
    // 同名タイトルでも `targetId` が違えば別マークとして両方残す
    // (古いコピー mark と新しい title-only mark の共存ケース)。
    // Distinct `targetId` keeps the entries separate — handles a stale copied
    // mark with a foreign id coexisting with a fresh title-only mark.
    const doc = buildDoc([
      {
        insert: "Foo",
        attributes: {
          wikiLink: { title: "Foo", targetId: "aaaa", exists: true, referenced: false },
        },
      },
      { insert: " " },
      {
        insert: "Foo",
        attributes: { wikiLink: { title: "Foo", exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(2);
    const targetIds = refs.wikiRefs.map((r) => r.targetId);
    expect(targetIds).toContain("aaaa");
    expect(targetIds).toContain(null);
  });

  it("extracts tag refs alongside wiki refs without interference", () => {
    const doc = buildDoc([
      {
        insert: "Foo",
        attributes: { wikiLink: { title: "Foo", exists: false, referenced: false } },
      },
      { insert: " " },
      {
        insert: "tech",
        attributes: { tag: { name: "tech", exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(1);
    expect(refs.tagRefs).toHaveLength(1);
    expect(refs.wikiRefs[0]?.normalizedTitle).toBe("foo");
    expect(refs.tagRefs[0]?.normalizedTitle).toBe("tech");
  });

  it("ignores segments without a relevant mark attribute", () => {
    // wikiLink / tag 以外の mark しか持たない区間は無視する。
    // Segments carrying only bold / italic marks must not pollute extraction.
    const doc = buildDoc([
      { insert: "bold text", attributes: { bold: true } },
      { insert: "italic", attributes: { italic: true } },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(0);
    expect(refs.tagRefs).toHaveLength(0);
  });

  it("ignores wiki marks with empty / non-string titles", () => {
    const doc = buildDoc([
      {
        insert: "  ",
        attributes: { wikiLink: { title: "   ", exists: false, referenced: false } },
      },
      {
        insert: "X",
        attributes: { wikiLink: { title: 42, exists: false, referenced: false } },
      },
    ]);
    const refs = extractRefsFromYDoc(doc);
    expect(refs.wikiRefs).toHaveLength(0);
  });
});

describe("planBucket", () => {
  const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
  const PAGE_FOO = "22222222-2222-2222-2222-222222222222";
  const PAGE_BAR = "33333333-3333-3333-3333-333333333333";

  function ref(
    normalizedTitle: string,
    displayTitle: string,
    targetId: string | null = null,
  ): {
    normalizedTitle: string;
    displayTitle: string;
    targetId: string | null;
  } {
    return { normalizedTitle, displayTitle, targetId };
  }

  function scope(
    opts: {
      titleToId?: Record<string, string>;
      validTargetIds?: string[];
    } = {},
  ): { titleToId: Map<string, string>; validTargetIds: Set<string> } {
    return {
      titleToId: new Map(Object.entries(opts.titleToId ?? {})),
      validTargetIds: new Set(opts.validTargetIds ?? []),
    };
  }

  it("resolves WikiLink titles to links when the same note has a matching page", () => {
    const plan = planBucket(
      SOURCE_ID,
      [ref("foo", "Foo")],
      scope({ titleToId: { foo: PAGE_FOO } }),
    );
    expect(plan.linkTargetIds.has(PAGE_FOO)).toBe(true);
    expect(plan.ghostTexts.size).toBe(0);
  });

  it("falls back to a ghost row when the title does not resolve", () => {
    const plan = planBucket(SOURCE_ID, [ref("foo", "Foo")], scope());
    expect(plan.linkTargetIds.size).toBe(0);
    expect(plan.ghostTexts.get("foo")).toBe("Foo");
  });

  it("prefers mark.targetId over title resolution (rename in flight)", () => {
    // mark.targetId が有効なら、タイトルが古い／存在しない場合でも edge を立てる。
    // A still-valid targetId wins even if the title has not updated yet
    // (in-flight rename); the edge is preserved and no ghost is added.
    const plan = planBucket(
      SOURCE_ID,
      [ref("foo", "Foo", PAGE_FOO)],
      scope({ validTargetIds: [PAGE_FOO] }),
    );
    expect(plan.linkTargetIds.has(PAGE_FOO)).toBe(true);
    expect(plan.ghostTexts.has("foo")).toBe(false);
  });

  it("drops a targetId that points outside the source page's note scope", () => {
    // 別ノートの id が乗っていた場合は validTargetIds に入ってこないので
    // ghost に倒される。ノート跨ぎでリンクを成立させない契約。
    // A `targetId` from a different note is filtered out of `validTargetIds`,
    // so the ref falls back to title (and if that fails, becomes a ghost).
    const plan = planBucket(SOURCE_ID, [ref("foo", "Foo", PAGE_FOO)], scope());
    expect(plan.linkTargetIds.size).toBe(0);
    expect(plan.ghostTexts.get("foo")).toBe("Foo");
  });

  it("does not link to the source page itself (self-reference guard)", () => {
    // タイトル一致で自分自身が出てきた場合は CHECK 制約に弾かれるので、links
    // にも ghost にも入れない（完全に無視）。
    // Title-based self-resolution is dropped entirely (CHECK rejects self
    // links and a same-page ghost is noise).
    const plan = planBucket(
      SOURCE_ID,
      [ref("self", "Self")],
      scope({ titleToId: { self: SOURCE_ID } }),
    );
    expect(plan.linkTargetIds.has(SOURCE_ID)).toBe(false);
    expect(plan.ghostTexts.size).toBe(0);
  });

  it("handles a mix of resolved and unresolved refs", () => {
    const plan = planBucket(
      SOURCE_ID,
      [ref("foo", "Foo"), ref("bar", "Bar"), ref("missing", "Missing")],
      scope({ titleToId: { foo: PAGE_FOO, bar: PAGE_BAR } }),
    );
    expect(plan.linkTargetIds.has(PAGE_FOO)).toBe(true);
    expect(plan.linkTargetIds.has(PAGE_BAR)).toBe(true);
    expect(plan.linkTargetIds.size).toBe(2);
    expect(plan.ghostTexts.get("missing")).toBe("Missing");
    expect(plan.ghostTexts.size).toBe(1);
  });

  it("does not duplicate ghost rows when the same normalized title appears twice", () => {
    // 同名 ghost は first-write-wins で 1 行に集約する。
    // Same normalized title collapses into a single ghost row (first spelling
    // wins).
    const plan = planBucket(SOURCE_ID, [ref("foo", "Foo"), ref("foo", "FOO")], scope());
    expect(plan.ghostTexts.size).toBe(1);
    expect(plan.ghostTexts.get("foo")).toBe("Foo");
  });
});
