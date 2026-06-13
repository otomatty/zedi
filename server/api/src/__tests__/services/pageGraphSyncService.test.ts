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

import {
  __test_only,
  syncPageGraphFromStoredYDoc,
  syncPageGraphFromYDoc,
} from "../../services/pageGraphSyncService.js";
import { createMockDb } from "../createMockDb.js";
import type { Database } from "../../types/index.js";

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

// ── DB トランザクションを通すラッパーのテスト ──────────────────────────────
// Tests for the DB-transaction wrappers. The mock DB resolves queries in the
// order they are issued: [lockSourcePage, (ydocState?), buildResolvedScope].
// DELETE / INSERT calls in `replaceBucket` resolve to undefined (unused).

const SRC = "11111111-1111-1111-1111-111111111111";

/**
 * 1 段落に wikiLink / tag マーク付きセグメントを並べた Y.Doc を作る。
 * Builds a Y.Doc whose single paragraph carries the given marked segments.
 */
function buildMarkedDoc(
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

function wikiSeg(title: string, targetId?: string) {
  return {
    insert: title,
    attributes: { wikiLink: { title, exists: false, referenced: false, targetId } },
  };
}

function tagSeg(name: string) {
  return { insert: name, attributes: { tag: { name, exists: false, referenced: false } } };
}

/** Finds the INSERT chain targeting the given drizzle table object. */
function insertedRows(
  chains: ReturnType<typeof createMockDb>["chains"],
  table: unknown,
): unknown[] | undefined {
  const chain = chains.find((c) => c.startMethod === "insert" && c.startArgs[0] === table);
  const valuesOp = chain?.ops.find((o) => o.method === "values");
  return valuesOp?.args[0] as unknown[] | undefined;
}

describe("syncPageGraphFromYDoc", () => {
  it("ソースページが存在しなければ no-op を返す / returns a no-op when the source page is missing", async () => {
    const { db } = createMockDb([[]]); // lockSourcePage → no rows
    const doc = buildMarkedDoc([wikiSeg("Target")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result).toEqual({
      wikiLinksInserted: 0,
      wikiGhostsInserted: 0,
      tagLinksInserted: 0,
      tagGhostsInserted: 0,
      skippedSourceNotFound: true,
    });
  });

  it("ソースページが削除済みなら no-op を返す / returns a no-op when the source page is soft-deleted", async () => {
    const { db } = createMockDb([[{ noteId: "note-1", isDeleted: true }]]);
    const doc = buildMarkedDoc([wikiSeg("Target")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result.skippedSourceNotFound).toBe(true);
    expect(result.wikiLinksInserted).toBe(0);
  });

  it("タイトル一致の WikiLink を links に挿入する / inserts a title-resolved WikiLink edge", async () => {
    const { db, chains } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }], // lockSourcePage
      [
        { id: "target-id", title: "Target", isDeleted: false },
        { id: SRC, title: "Source", isDeleted: false },
      ], // buildResolvedScope
    ]);
    const doc = buildMarkedDoc([wikiSeg("Target")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result).toEqual({
      wikiLinksInserted: 1,
      wikiGhostsInserted: 0,
      tagLinksInserted: 0,
      tagGhostsInserted: 0,
      skippedSourceNotFound: false,
    });
    // 挿入された links 行は (source, target, wiki)。
    // The inserted link row is (source, target, wiki).
    const { links } = await import("../../schema/index.js");
    expect(insertedRows(chains, links)).toEqual([
      { sourceId: SRC, targetId: "target-id", linkType: "wiki" },
    ]);
  });

  it("mark.targetId が有効なら id 解決を優先する / id resolution wins when the mark's targetId is valid", async () => {
    const { db, chains } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }],
      [
        // タイトルは古い ("Old") が、targetId が同ノートの有効ページを指す。
        // Stale title but the targetId points to a valid in-scope page.
        { id: "tgt-id", title: "Renamed", isDeleted: false },
        { id: SRC, title: "Source", isDeleted: false },
      ],
    ]);
    const doc = buildMarkedDoc([wikiSeg("Old Title", "tgt-id")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result.wikiLinksInserted).toBe(1);
    const { links } = await import("../../schema/index.js");
    expect(insertedRows(chains, links)).toEqual([
      { sourceId: SRC, targetId: "tgt-id", linkType: "wiki" },
    ]);
  });

  it("解決できない WikiLink は ghost_links に倒す / unresolved WikiLinks become ghost rows", async () => {
    const { db, chains } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }],
      [{ id: SRC, title: "Source", isDeleted: false }], // no matching page in scope
    ]);
    const doc = buildMarkedDoc([wikiSeg("Ghosty")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result.wikiLinksInserted).toBe(0);
    expect(result.wikiGhostsInserted).toBe(1);
    const { ghostLinks } = await import("../../schema/index.js");
    expect(insertedRows(chains, ghostLinks)).toEqual([
      { linkText: "Ghosty", sourcePageId: SRC, linkType: "wiki" },
    ]);
  });

  it("wiki と tag を別バケットで集計する / counts wiki and tag buckets independently", async () => {
    const { db } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }],
      [
        { id: "target-id", title: "Target", isDeleted: false },
        { id: "tech-id", title: "tech", isDeleted: false },
        { id: SRC, title: "Source", isDeleted: false },
      ],
    ]);
    const doc = buildMarkedDoc([wikiSeg("Target"), tagSeg("tech"), wikiSeg("Ghosty")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result).toEqual({
      wikiLinksInserted: 1,
      wikiGhostsInserted: 1,
      tagLinksInserted: 1,
      tagGhostsInserted: 0,
      skippedSourceNotFound: false,
    });
  });

  it("ノート外の targetId は弾いて ghost に倒す / a targetId outside the note scope falls back to a ghost", async () => {
    const { db } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }],
      [{ id: SRC, title: "Source", isDeleted: false }], // foreign-id page not in scope
    ]);
    const doc = buildMarkedDoc([wikiSeg("Foreign", "outside-note-id")]);

    const result = await syncPageGraphFromYDoc(db as unknown as Database, SRC, doc);

    expect(result.wikiLinksInserted).toBe(0);
    expect(result.wikiGhostsInserted).toBe(1);
  });
});

describe("syncPageGraphFromStoredYDoc", () => {
  /** Encodes a Y.Doc as a stored update Buffer (page_contents.ydoc_state). */
  function encodeDoc(doc: Y.Doc): Buffer {
    return Buffer.from(Y.encodeStateAsUpdate(doc));
  }

  it("ソースページが無ければ null を返す / returns null when the source page is missing", async () => {
    const { db } = createMockDb([[]]); // lockSourcePage → no rows

    const result = await syncPageGraphFromStoredYDoc(db as unknown as Database, SRC);

    expect(result).toBeNull();
  });

  it("ソースページが削除済みなら skippedSourceNotFound を返す / returns skipped result when soft-deleted", async () => {
    const { db } = createMockDb([[{ noteId: "note-1", isDeleted: true }]]);

    const result = await syncPageGraphFromStoredYDoc(db as unknown as Database, SRC);

    expect(result).toEqual({
      wikiLinksInserted: 0,
      wikiGhostsInserted: 0,
      tagLinksInserted: 0,
      tagGhostsInserted: 0,
      skippedSourceNotFound: true,
    });
  });

  it("保存された ydoc_state が無ければ null を返す / returns null when no stored ydoc_state exists", async () => {
    const { db } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }], // lock
      [], // pageContents → no rows
    ]);

    const result = await syncPageGraphFromStoredYDoc(db as unknown as Database, SRC);

    expect(result).toBeNull();
  });

  it("保存済み Y.Doc を復元してグラフを再構築する / hydrates the stored Y.Doc and rebuilds the graph", async () => {
    const doc = buildMarkedDoc([wikiSeg("Target")]);
    const { db } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }], // lock
      [{ ydocState: encodeDoc(doc) }], // pageContents
      [
        { id: "target-id", title: "Target", isDeleted: false },
        { id: SRC, title: "Source", isDeleted: false },
      ], // buildResolvedScope
    ]);

    const result = await syncPageGraphFromStoredYDoc(db as unknown as Database, SRC);

    expect(result).toEqual({
      wikiLinksInserted: 1,
      wikiGhostsInserted: 0,
      tagLinksInserted: 0,
      tagGhostsInserted: 0,
      skippedSourceNotFound: false,
    });
  });

  it("base64 文字列で保存された ydoc_state も復元できる / hydrates a base64-string ydoc_state", async () => {
    // 一部のドライバ構成では ydoc_state が base64 文字列で返るため、その経路も検証。
    // Some driver configs hand back the bytes as a base64 string; cover that path.
    const doc = buildMarkedDoc([wikiSeg("Ghosty")]);
    const base64 = encodeDoc(doc).toString("base64");
    const { db } = createMockDb([
      [{ noteId: "note-1", isDeleted: false }],
      [{ ydocState: base64 }],
      [{ id: SRC, title: "Source", isDeleted: false }],
    ]);

    const result = await syncPageGraphFromStoredYDoc(db as unknown as Database, SRC);

    expect(result?.wikiGhostsInserted).toBe(1);
  });
});
