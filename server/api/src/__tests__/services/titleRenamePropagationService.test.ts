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
const OWNER_ID = "owner-user-1";

/** Default scope result: personal page owned by OWNER_ID. 個人ページ既定スコープ。 */
const PERSONAL_SCOPE_ROW = [{ noteId: null, ownerId: OWNER_ID }];

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

  it("rewrites matching wikiLink marks, updates contentText/preview, and invalidates the doc", async () => {
    const originalYdoc = makeYdocWithWikiLink("Foo");

    // Query plan:
    //   1. SELECT sourceId FROM links WHERE targetId = ...   → sources
    //   2. TX: SELECT 1 ... FOR UPDATE                       → (ignored)
    //   3. TX: SELECT * FROM page_contents                   → row with old ydoc
    //   4. TX: UPDATE page_contents                          → (ignored)
    //   5. TX: UPDATE pages (content_preview)                → (ignored)
    //   6. TX (promote): SELECT pages scope                  → personal scope
    //   7. TX (promote): SELECT candidates (join)            → [] (no ghosts)
    const { db, chains } = createMockDb([
      [{ sourceId: SOURCE_PAGE_ID }], // 1
      [], // 2 — FOR UPDATE
      [{ pageId: SOURCE_PAGE_ID, ydocState: originalYdoc, version: 7 }], // 3
      [{ version: 8 }], // 4
      [], // 5
      PERSONAL_SCOPE_ROW, // 6
      [], // 7 — no candidates
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

    // UPDATE page_contents carries ydoc_state (wikiLink title → "Bar") and
    // the freshly-extracted contentText. UPDATE pages carries content_preview.
    // UPDATE page_contents は ydoc_state と contentText を更新し、UPDATE pages は
    // content_preview を更新する。
    const updateChains = chains.filter((c) => c.startMethod === "update");
    expect(updateChains.length).toBe(2);
    const pageContentsUpdate = updateChains.find((c) => {
      const setArg = c.ops.find((op) => op.method === "set")?.args[0] as
        | Record<string, unknown>
        | undefined;
      return setArg && "ydocState" in setArg;
    });
    expect(pageContentsUpdate).toBeTruthy();
    const pcSetArg = pageContentsUpdate?.ops.find((op) => op.method === "set")?.args[0] as
      | { ydocState: Buffer; contentText: string }
      | undefined;
    expect(pcSetArg?.ydocState).toBeInstanceOf(Buffer);
    // `extractTextFromYXml` appends a newline after block-level XmlElements
    // (e.g. paragraph), so the raw plain text is `"Bar\n"`.
    // `extractTextFromYXml` はブロック要素 (paragraph 等) の後に改行を付けるため、
    // プレーンテキストは末尾に改行が付く。
    expect(pcSetArg?.contentText).toBe("Bar\n");
    if (pcSetArg?.ydocState) {
      expect(decodeYdocWikiLinkTitle(pcSetArg.ydocState)).toBe("Bar");
    }

    const pagesUpdate = updateChains.find((c) => {
      const setArg = c.ops.find((op) => op.method === "set")?.args[0] as
        | Record<string, unknown>
        | undefined;
      return setArg && "contentPreview" in setArg;
    });
    expect(pagesUpdate).toBeTruthy();
    const pagesSetArg = pagesUpdate?.ops.find((op) => op.method === "set")?.args[0] as
      | { contentPreview: string }
      | undefined;
    expect(pagesSetArg?.contentPreview).toBe("Bar");
  });

  it("skips rewriting when the source page has no page_contents row", async () => {
    const { db, chains } = createMockDb([
      [{ sourceId: SOURCE_PAGE_ID }], // sources
      [], // FOR UPDATE
      [], // page_contents empty
      PERSONAL_SCOPE_ROW, // ghost scope
      [], // ghost candidates (none)
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
      PERSONAL_SCOPE_ROW, // ghost scope
      [], // ghost candidates (none)
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

  it("promotes in-scope ghost links whose text matches the new title", async () => {
    const GHOST_SOURCE = "11111111-aaaa-bbbb-cccc-000000000003";

    const { db, chains } = createMockDb([
      [], // no real link sources
      PERSONAL_SCOPE_ROW, // renamed-page scope (personal)
      // in-scope ghost candidates (SELECT … INNER JOIN pages)
      [
        { sourcePageId: GHOST_SOURCE, linkType: "wiki" },
        { sourcePageId: GHOST_SOURCE, linkType: "tag" },
      ],
      [], // DELETE ghost_links (result ignored)
      [], // INSERT links (result ignored)
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.ghostPromotionsCount).toBe(2);

    // Delete on ghost_links and Insert on links should both be present.
    // 削除と挿入の両方が行われる。
    const deleteChain = chains.find((c) => c.startMethod === "delete");
    expect(deleteChain).toBeTruthy();
    const insertChain = chains.find((c) => c.startMethod === "insert");
    expect(insertChain).toBeTruthy();
    const valuesCall = insertChain?.ops.find((op) => op.method === "values");
    const valuesArg = valuesCall?.args[0] as Array<{
      sourceId: string;
      targetId: string;
      linkType: string;
    }>;
    expect(valuesArg).toHaveLength(2);
    expect(valuesArg?.every((v) => v.targetId === PAGE_ID)).toBe(true);
  });

  it("does not issue DELETE or INSERT when no in-scope ghost candidates match", async () => {
    const { db, chains } = createMockDb([
      [], // no sources
      PERSONAL_SCOPE_ROW, // scope
      [], // candidates (empty)
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.ghostPromotionsCount).toBe(0);
    expect(chains.find((c) => c.startMethod === "delete")).toBeUndefined();
    expect(chains.find((c) => c.startMethod === "insert")).toBeUndefined();
  });

  it("skips ghost promotion when the renamed page's scope row is missing", async () => {
    // The renamed page was deleted between the title change and the background
    // propagation run. Without a scope row we can't decide which ghosts belong
    // to the same tenant, so we skip promotion entirely.
    // リネーム対象の pages 行が消えた場合はスコープ判定が出来ないため、
    // ゴースト昇格はスキップする（PR #736 P1 レビュー対応）。
    const { db, chains } = createMockDb([
      [], // no sources
      [], // pages scope — empty
    ]);
    const invalidate = vi.fn();

    const result = await propagateTitleRename(db as never, PAGE_ID, "Foo", "Bar", {
      invalidateDocument: invalidate,
    });

    expect(result.ghostPromotionsCount).toBe(0);
    // Only the initial "sources" select + the scope select should have run.
    // 初期の sources SELECT とスコープ SELECT のみ。
    expect(chains.filter((c) => c.startMethod === "select")).toHaveLength(2);
    expect(chains.find((c) => c.startMethod === "delete")).toBeUndefined();
    expect(chains.find((c) => c.startMethod === "insert")).toBeUndefined();
  });

  it("records failures per source page and still attempts ghost promotion", async () => {
    // 1st source: FOR UPDATE rejects with an error → counted as failure.
    //   ただしベストエフォート方針で後続処理（ghost 昇格）は続行する。
    // Best-effort: a per-source failure must not abort ghost promotion.
    const baseResults = [
      [{ sourceId: SOURCE_PAGE_ID }], // sources
      PERSONAL_SCOPE_ROW, // promote scope
      [], // promote candidates (none)
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
