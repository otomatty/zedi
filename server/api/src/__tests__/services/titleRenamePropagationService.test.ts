/**
 * `titleRenamePropagationService` の単体テスト。
 * Unit tests for `titleRenamePropagationService` — orchestrates WikiLink /
 * tag rewrites across source pages and ghost promotion when a page is
 * renamed (issue #726).
 */

import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";

import { createMockDb } from "../createMockDb.js";
import { propagateTitleRename } from "../../services/titleRenamePropagationService.js";

/**
 * page_contents 行に入っているようなバイナリ Y.Doc を生成するヘルパー。
 * Build an encoded Y.Doc blob shaped like a `page_contents.ydoc_state` row.
 */
function makeYdocWithWikiLink(title: string): Buffer {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  fragment.insert(0, [paragraph]);
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  text.insert(0, title, { wikiLink: { title, exists: true, referenced: false } });
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function decodeYdocWikiLinkTitle(buffer: Buffer): string | null {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(buffer));
  const fragment = doc.getXmlFragment("default");
  const paragraph = fragment.get(0);
  if (!(paragraph instanceof Y.XmlElement)) return null;
  const text = paragraph.get(0);
  if (!(text instanceof Y.XmlText)) return null;
  const delta = text.toDelta() as Array<{ insert: unknown; attributes?: Record<string, unknown> }>;
  for (const item of delta) {
    const wl = item.attributes?.wikiLink as { title?: string } | undefined;
    if (wl?.title) return wl.title;
  }
  return null;
}

const PAGE_ID = "11111111-aaaa-bbbb-cccc-000000000001";
const SOURCE_PAGE_ID = "11111111-aaaa-bbbb-cccc-000000000002";

describe("propagateTitleRename", () => {
  it("returns a zero result and skips all DB work when oldTitle or newTitle is missing", async () => {
    const { db, chains } = createMockDb([]);
    const invalidate = vi.fn().mockResolvedValue(undefined);

    const a = await propagateTitleRename(db as never, PAGE_ID, "", "Bar", {
      invalidateDocument: invalidate,
    });
    const b = await propagateTitleRename(db as never, PAGE_ID, "Foo", undefined, {
      invalidateDocument: invalidate,
    });
    const c = await propagateTitleRename(db as never, PAGE_ID, null, "Foo", {
      invalidateDocument: invalidate,
    });

    for (const r of [a, b, c]) {
      expect(r.sourcePagesAttempted).toBe(0);
      expect(r.wikiLinkMarksUpdated).toBe(0);
      expect(r.tagMarksUpdated).toBe(0);
      expect(r.ghostPromotionsCount).toBe(0);
    }
    expect(chains.length).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns a zero result when oldTitle and newTitle normalize to the same value", async () => {
    const { db, chains } = createMockDb([]);
    const invalidate = vi.fn().mockResolvedValue(undefined);

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "  foo  ", {
      invalidateDocument: invalidate,
    });

    expect(result.sourcePagesAttempted).toBe(0);
    expect(result.ghostPromotionsCount).toBe(0);
    expect(chains.length).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rewrites matching wikiLink marks in each source page and invalidates each doc", async () => {
    const originalYdoc = makeYdocWithWikiLink("Foo");

    // Query plan:
    //   1. SELECT sourceId FROM links WHERE targetId = ...   → [{ sourceId }]
    //   2. TX: SELECT 1 ... FOR UPDATE                       → (ignored result)
    //   3. TX: SELECT * FROM page_contents                   → [{ version: 7, ydocState: ... }]
    //   4. TX: UPDATE page_contents ...                      → [{ version: 8 }]
    //   5. DELETE FROM ghost_links ... RETURNING             → []
    //   (no INSERT when no ghosts)
    const { db, chains } = createMockDb([
      [{ sourceId: SOURCE_PAGE_ID }], // 1
      [], // 2 — FOR UPDATE lock
      [{ pageId: SOURCE_PAGE_ID, ydocState: originalYdoc, version: 7 }], // 3
      [{ version: 8 }], // 4
      [], // 5 — ghost delete (none)
    ]);
    const invalidate = vi.fn().mockResolvedValue(undefined);

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.sourcePagesAttempted).toBe(1);
    expect(result.sourcePagesSucceeded).toBe(1);
    expect(result.sourcePagesFailed).toBe(0);
    expect(result.wikiLinkMarksUpdated).toBe(1);
    expect(result.wikiLinkTextUpdated).toBe(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(SOURCE_PAGE_ID);

    // UPDATE chain should carry a new ydoc_state whose wiki-link title is "Bar".
    // UPDATE チェーンに新しい ydoc_state（wikiLink.title = "Bar"）が入っていること。
    const updateChain = chains.find((c) => c.startMethod === "update");
    expect(updateChain).toBeTruthy();
    const setCall = updateChain?.ops.find((op) => op.method === "set");
    const setArg = setCall?.args[0] as { ydocState: Buffer } | undefined;
    expect(setArg?.ydocState).toBeInstanceOf(Buffer);
    if (setArg?.ydocState) {
      expect(decodeYdocWikiLinkTitle(setArg.ydocState)).toBe("Bar");
    }
  });

  it("skips rewriting when the source page has no page_contents row", async () => {
    const { db, chains } = createMockDb([
      [{ sourceId: SOURCE_PAGE_ID }], // sources
      [], // FOR UPDATE
      [], // page_contents empty
      [], // ghost delete (none)
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.sourcePagesAttempted).toBe(1);
    expect(result.sourcePagesSucceeded).toBe(1);
    expect(result.wikiLinkMarksUpdated).toBe(0);
    // No UPDATE when there's no content row. / コンテンツ行が無ければ UPDATE しない。
    const updateChain = chains.find((c) => c.startMethod === "update");
    expect(updateChain).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("skips UPDATE and invalidation when rewriting yields zero changes", async () => {
    // Source page has no matching wiki-link: the rewriter returns zero changes.
    // ソース側にマッチするリンクが無ければ書き換えゼロで終わる。
    const unrelatedYdoc = makeYdocWithWikiLink("Unrelated");

    const { db, chains } = createMockDb([
      [{ sourceId: SOURCE_PAGE_ID }],
      [], // FOR UPDATE
      [{ pageId: SOURCE_PAGE_ID, ydocState: unrelatedYdoc, version: 1 }],
      [], // ghost delete (none)
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.sourcePagesAttempted).toBe(1);
    expect(result.wikiLinkMarksUpdated).toBe(0);
    expect(chains.find((c) => c.startMethod === "update")).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("promotes ghost links whose text matches the new title and inserts real link rows", async () => {
    const GHOST_SOURCE = "11111111-aaaa-bbbb-cccc-000000000003";

    const { db, chains } = createMockDb([
      [], // no real link sources
      // ghost delete RETURNING promoted rows
      [
        { sourcePageId: GHOST_SOURCE, linkType: "wiki", linkText: "Bar" },
        { sourcePageId: GHOST_SOURCE, linkType: "tag", linkText: "bar" },
      ],
      [], // insert links (no result needed)
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.ghostPromotionsCount).toBe(2);

    // Delete chain on ghost_links exists
    const deleteChain = chains.find((c) => c.startMethod === "delete");
    expect(deleteChain).toBeTruthy();
    // Insert chain on links exists when promotions happened
    const insertChain = chains.find((c) => c.startMethod === "insert");
    expect(insertChain).toBeTruthy();
    // Insert should carry a values() call with N rows
    const valuesCall = insertChain?.ops.find((op) => op.method === "values");
    const valuesArg = valuesCall?.args[0] as Array<{
      sourceId: string;
      targetId: string;
      linkType: string;
    }>;
    expect(valuesArg).toHaveLength(2);
    expect(valuesArg?.every((v) => v.targetId === PAGE_ID)).toBe(true);
  });

  it("does not issue the INSERT when the ghost delete returned no rows", async () => {
    const { db, chains } = createMockDb([
      [], // no sources
      [], // ghost delete — nothing promoted
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.ghostPromotionsCount).toBe(0);
    expect(chains.find((c) => c.startMethod === "insert")).toBeUndefined();
  });

  it("records failures per source page and still attempts ghost promotion", async () => {
    // 1st source: FOR UPDATE rejects with an error → counted as failure.
    //   ただしベストエフォート方針で後続処理（ghost 昇格）は続行する。
    // Best-effort: a per-source failure must not abort ghost promotion.
    const chainIndexFailure = 0;
    void chainIndexFailure;

    // Simulate the tx by constructing db where the FOR UPDATE execute throws.
    // We can't easily throw from createMockDb, so we override the execute method
    // for this specific test by wrapping db.
    const baseResults = [
      [{ sourceId: SOURCE_PAGE_ID }], // sources
      [], // ghost delete (none)
    ];
    const base = createMockDb(baseResults);
    let forUpdateCallCount = 0;
    const db = new Proxy(base.db as unknown as Record<string, unknown>, {
      get(target, prop: string) {
        if (prop === "transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) => {
            const txProxy = new Proxy(target, {
              get(t, p: string) {
                if (p === "execute") {
                  // First FOR UPDATE execute call throws.
                  // 1 回目の FOR UPDATE を失敗させる。
                  return () => {
                    forUpdateCallCount += 1;
                    if (forUpdateCallCount === 1) {
                      return Promise.reject(new Error("lock failed"));
                    }
                    return Promise.resolve([]);
                  };
                }
                return (t as never)[p];
              },
            });
            return fn(txProxy);
          };
        }
        return (target as never)[prop];
      },
    });
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.sourcePagesAttempted).toBe(1);
    expect(result.sourcePagesFailed).toBe(1);
    expect(result.sourcePagesSucceeded).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    // Ghost promotion path still ran (empty result here). / ゴースト昇格の経路は通る。
    expect(result.ghostPromotionsCount).toBe(0);
  });
});
