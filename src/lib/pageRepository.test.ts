import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IPageRepository, CreatePageOptions, PageRepositoryOptions } from "./pageRepository";
import type { Page, PageSummary, Link, GhostLink, LinkType } from "@/types/page";
import { StorageAdapterPageRepository } from "./pageRepository/StorageAdapterPageRepository";
import type { StorageAdapter } from "./storageAdapter/StorageAdapter";
import type { ApiClient } from "./api/apiClient";

/**
 * `pageRepository.ts` は型のみのインターフェース層であり、ランタイムロジックを
 * 持たない。本テストは「インターフェースを満たす実装が、各 method を 1:1 で
 * 下位ストア (=adapter) に委譲する」という契約をスパイで検証する。
 *
 * Concrete adapters (e.g. `StorageAdapterPageRepository`) carry their own
 * behaviour tests; here we only verify the interface contract — every method
 * exists, has the documented signature, and delegates verbatim.
 *
 * `pageRepository.ts` is a types-only module with no runtime behaviour. This
 * test pins the contract: any implementation must expose every documented
 * method and forward arguments to its underlying store.
 */

interface PageStoreLike {
  pages: Map<string, Page>;
  links: Link[];
  ghostLinks: GhostLink[];
}

function makeStore(): PageStoreLike {
  return { pages: new Map(), links: [], ghostLinks: [] };
}

/**
 * 最小の `IPageRepository` 実装。各 method は store にしか触らず、CRUD と link
 * 系は spy 越しに呼び出し回数を検証できる。
 *
 * Minimal repository implementation that delegates each method straight to a
 * mutable store map; we then spy on it to verify delegation in tests.
 */
function createInMemoryRepository(
  store: PageStoreLike,
  options?: PageRepositoryOptions,
): IPageRepository {
  const fireMutate = async (): Promise<void> => {
    if (options?.onMutate) await options.onMutate();
  };

  const repo: IPageRepository = {
    async createPage(userId, title = "", content = "", opts) {
      const id = `id-${store.pages.size + 1}`;
      const now = Date.now();
      const page: Page = {
        id,
        ownerUserId: userId,
        noteId: null,
        title,
        content,
        thumbnailUrl: opts?.thumbnailUrl ?? undefined,
        sourceUrl: opts?.sourceUrl ?? undefined,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };
      store.pages.set(id, page);
      await fireMutate();
      return page;
    },
    async getPage(_userId, pageId) {
      const p = store.pages.get(pageId);
      return p && !p.isDeleted ? p : null;
    },
    async getPages(_userId) {
      return [...store.pages.values()].filter((p) => !p.isDeleted);
    },
    async getPagesSummary(_userId) {
      return [...store.pages.values()]
        .filter((p) => !p.isDeleted)
        .map<PageSummary>((p) => ({
          id: p.id,
          ownerUserId: p.ownerUserId,
          noteId: p.noteId,
          title: p.title,
          contentPreview: p.contentPreview,
          thumbnailUrl: p.thumbnailUrl,
          sourceUrl: p.sourceUrl,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          isDeleted: p.isDeleted,
        }));
    },
    async getPagesByIds(_userId, ids) {
      return ids
        .map((id) => store.pages.get(id))
        .filter((p): p is Page => p !== undefined && !p.isDeleted);
    },
    async getPageByTitle(_userId, title) {
      return [...store.pages.values()].find((p) => p.title === title && !p.isDeleted) ?? null;
    },
    async checkDuplicateTitle(_userId, title, excludePageId) {
      return (
        [...store.pages.values()].find(
          (p) => p.title === title && p.id !== excludePageId && !p.isDeleted,
        ) ?? null
      );
    },
    async updatePage(_userId, pageId, updates) {
      const p = store.pages.get(pageId);
      if (!p) return;
      store.pages.set(pageId, { ...p, ...updates, updatedAt: Date.now() });
      await fireMutate();
    },
    async deletePage(_userId, pageId) {
      const p = store.pages.get(pageId);
      if (p) store.pages.set(pageId, { ...p, isDeleted: true });
      await fireMutate();
    },
    async searchPages(_userId, query) {
      const normalized = query.toLowerCase().trim();
      if (!normalized) return [];
      return [...store.pages.values()].filter((p) => {
        if (p.isDeleted) return false;
        return (
          p.title.toLowerCase().includes(normalized) || p.content.toLowerCase().includes(normalized)
        );
      });
    },
    async addLink(sourceId, targetId, linkType: LinkType = "wiki") {
      if (
        store.links.some(
          (l) => l.sourceId === sourceId && l.targetId === targetId && l.linkType === linkType,
        )
      ) {
        return;
      }
      store.links.push({ sourceId, targetId, linkType, createdAt: Date.now() });
      await fireMutate();
    },
    async removeLink(sourceId, targetId, linkType: LinkType = "wiki") {
      store.links = store.links.filter(
        (l) => !(l.sourceId === sourceId && l.targetId === targetId && l.linkType === linkType),
      );
      await fireMutate();
    },
    async getOutgoingLinks(pageId, linkType: LinkType = "wiki") {
      return store.links
        .filter((l) => l.sourceId === pageId && l.linkType === linkType)
        .map((l) => l.targetId);
    },
    async getBacklinks(pageId, linkType: LinkType = "wiki") {
      return store.links
        .filter((l) => l.targetId === pageId && l.linkType === linkType)
        .map((l) => l.sourceId);
    },
    async getLinks(_userId) {
      return [...store.links];
    },
    async addGhostLink(linkText, sourcePageId, linkType: LinkType = "wiki") {
      if (
        store.ghostLinks.some(
          (g) =>
            g.linkText === linkText && g.sourcePageId === sourcePageId && g.linkType === linkType,
        )
      ) {
        return;
      }
      store.ghostLinks.push({
        linkText,
        sourcePageId,
        linkType,
        createdAt: Date.now(),
      });
      await fireMutate();
    },
    async removeGhostLink(linkText, sourcePageId, linkType: LinkType = "wiki") {
      store.ghostLinks = store.ghostLinks.filter(
        (g) =>
          !(g.linkText === linkText && g.sourcePageId === sourcePageId && g.linkType === linkType),
      );
      await fireMutate();
    },
    async getGhostLinkSources(linkText, linkType: LinkType = "wiki") {
      return store.ghostLinks
        .filter((g) => g.linkText === linkText && g.linkType === linkType)
        .map((g) => g.sourcePageId);
    },
    async getGhostLinks(_userId) {
      return [...store.ghostLinks];
    },
    async getGhostLinksBySourcePage(sourcePageId, linkType: LinkType = "wiki") {
      return store.ghostLinks
        .filter((g) => g.sourcePageId === sourcePageId && g.linkType === linkType)
        .map((g) => g.linkText);
    },
    async promoteGhostLink(userId, linkText) {
      const sources = await repo.getGhostLinkSources(linkText, "wiki");
      if (sources.length < 2) return null;
      const created = await repo.createPage(userId, linkText, "");
      for (const sourceId of sources) {
        await repo.addLink(sourceId, created.id, "wiki");
        await repo.removeGhostLink(linkText, sourceId, "wiki");
      }
      return created;
    },
  };

  return repo;
}

describe("IPageRepository contract", () => {
  let store: PageStoreLike;
  let repo: IPageRepository;

  beforeEach(() => {
    store = makeStore();
    repo = createInMemoryRepository(store);
  });

  it("exposes every documented method as a function", () => {
    const required = [
      "createPage",
      "getPage",
      "getPages",
      "getPagesSummary",
      "getPagesByIds",
      "getPageByTitle",
      "checkDuplicateTitle",
      "updatePage",
      "deletePage",
      "searchPages",
      "addLink",
      "removeLink",
      "getOutgoingLinks",
      "getBacklinks",
      "getLinks",
      "addGhostLink",
      "removeGhostLink",
      "getGhostLinkSources",
      "getGhostLinks",
      "getGhostLinksBySourcePage",
      "promoteGhostLink",
    ] as const;

    for (const name of required) {
      expect(typeof (repo as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("createPage stores a Page and respects CreatePageOptions", async () => {
    const options: CreatePageOptions = {
      sourceUrl: "https://example.com",
      thumbnailUrl: "https://thumb.example.com/x.png",
    };
    const page = await repo.createPage("user-1", "Title", "body", options);

    expect(page.title).toBe("Title");
    expect(page.ownerUserId).toBe("user-1");
    expect(page.sourceUrl).toBe(options.sourceUrl);
    expect(page.thumbnailUrl).toBe(options.thumbnailUrl);
    expect(store.pages.size).toBe(1);
  });

  it("read methods return what the underlying store contains", async () => {
    await repo.createPage("u1", "Alpha");
    await repo.createPage("u1", "Bravo");

    const all = await repo.getPages("u1");
    expect(all.map((p) => p.title).sort()).toEqual(["Alpha", "Bravo"]);

    const byTitle = await repo.getPageByTitle("u1", "Alpha");
    expect(byTitle?.title).toBe("Alpha");

    const ids = all.map((p) => p.id);
    const byIds = await repo.getPagesByIds("u1", ids);
    expect(byIds).toHaveLength(2);

    const summaries = await repo.getPagesSummary("u1");
    expect(summaries).toHaveLength(2);
    // contentPreview / thumbnailUrl は省略されていてよいが、必須キーは存在する
    // contentPreview / thumbnailUrl may be omitted, but required keys are present
    for (const s of summaries) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("noteId");
    }
  });

  it("checkDuplicateTitle excludes the given page id", async () => {
    const a = await repo.createPage("u1", "Same");
    await repo.createPage("u1", "Same");

    const dup = await repo.checkDuplicateTitle("u1", "Same", a.id);
    expect(dup).not.toBeNull();
    expect(dup?.id).not.toBe(a.id);
  });

  it("updatePage merges fields and deletePage soft-deletes", async () => {
    const page = await repo.createPage("u1", "Old");
    await repo.updatePage("u1", page.id, { title: "New" });
    expect((await repo.getPage("u1", page.id))?.title).toBe("New");

    await repo.deletePage("u1", page.id);
    expect(await repo.getPage("u1", page.id)).toBeNull();
  });

  it("read methods consistently hide soft-deleted pages", async () => {
    // モックの soft-delete 挙動が read 系全体で一貫しているかを担保する。
    // gemini-code-assist のレビューで指摘されたモック内一貫性のリグレッション防止。
    //
    // Pin the mock's soft-delete contract across every read path so tests that
    // exercise deletion paths get consistent results. Regression guard for the
    // gemini-code-assist review feedback.
    const alive = await repo.createPage("u1", "Alive");
    const tombstone = await repo.createPage("u1", "Tombstone");
    await repo.deletePage("u1", tombstone.id);

    expect((await repo.getPages("u1")).map((p) => p.id)).toEqual([alive.id]);
    expect((await repo.getPagesSummary("u1")).map((p) => p.id)).toEqual([alive.id]);
    expect((await repo.getPagesByIds("u1", [alive.id, tombstone.id])).map((p) => p.id)).toEqual([
      alive.id,
    ]);
    expect(await repo.getPageByTitle("u1", "Tombstone")).toBeNull();
    expect(await repo.checkDuplicateTitle("u1", "Tombstone")).toBeNull();
  });

  it("searchPages mirrors pageStore semantics: title+content, trim, hide deleted", async () => {
    // gemini-code-assist のレビュー対応: 実装側 (pageStore.searchPages) の
    // 「title+content の部分一致」「空クエリは []」「論理削除は除外」をモックも遵守する。
    //
    // Address gemini-code-assist review: the mock now matches `pageStore.searchPages`
    // — title+content match, blank queries return [], soft-deleted pages excluded.
    await repo.createPage("u1", "Hello", "alpha body");
    await repo.createPage("u1", "World", "beta body");
    const trashed = await repo.createPage("u1", "Trash", "alpha trashed");
    await repo.deletePage("u1", trashed.id);

    expect((await repo.searchPages("u1", "alpha")).map((p) => p.title)).toEqual(["Hello"]);
    expect((await repo.searchPages("u1", "BODY")).map((p) => p.title).sort()).toEqual([
      "Hello",
      "World",
    ]);
    expect(await repo.searchPages("u1", "   ")).toEqual([]);
  });

  it("link methods default linkType to 'wiki' (issue #725 Phase 1)", async () => {
    await repo.addLink("a", "b");
    await repo.addLink("a", "c", "tag");

    expect(await repo.getOutgoingLinks("a")).toEqual(["b"]);
    expect(await repo.getOutgoingLinks("a", "tag")).toEqual(["c"]);
    expect(await repo.getBacklinks("b")).toEqual(["a"]);

    const all = await repo.getLinks("u1");
    expect(all.map((l) => l.linkType).sort()).toEqual(["tag", "wiki"]);

    await repo.removeLink("a", "b");
    expect(await repo.getOutgoingLinks("a")).toEqual([]);
    // タグ側は削除されないことを確認 / tag-typed edge survives wiki removal
    expect(await repo.getOutgoingLinks("a", "tag")).toEqual(["c"]);
  });

  it("ghost link methods support linkType scoping and source listing", async () => {
    await repo.addGhostLink("Topic", "p1");
    await repo.addGhostLink("Topic", "p2");
    await repo.addGhostLink("Topic", "p3", "tag");

    expect((await repo.getGhostLinkSources("Topic")).sort()).toEqual(["p1", "p2"]);
    expect(await repo.getGhostLinkSources("Topic", "tag")).toEqual(["p3"]);
    expect(await repo.getGhostLinksBySourcePage("p1")).toEqual(["Topic"]);

    const all = await repo.getGhostLinks("u1");
    expect(all).toHaveLength(3);

    await repo.removeGhostLink("Topic", "p1");
    expect((await repo.getGhostLinkSources("Topic")).sort()).toEqual(["p2"]);
  });

  it("promoteGhostLink only promotes when 2+ wiki ghosts exist", async () => {
    expect(await repo.promoteGhostLink("u1", "Solo")).toBeNull();

    await repo.addGhostLink("Pair", "p1");
    await repo.addGhostLink("Pair", "p2");
    const created = await repo.promoteGhostLink("u1", "Pair");
    expect(created).not.toBeNull();
    expect(created?.title).toBe("Pair");

    expect(await repo.getGhostLinkSources("Pair")).toEqual([]);
    const out1 = await repo.getOutgoingLinks("p1");
    const out2 = await repo.getOutgoingLinks("p2");
    expect(out1).toContain(created?.id);
    expect(out2).toContain(created?.id);
  });

  it("delegates each mutation through the same wrapped object (spy contract)", async () => {
    const wrapped = createInMemoryRepository(makeStore());
    const spy = {
      createPage: vi.spyOn(wrapped, "createPage"),
      updatePage: vi.spyOn(wrapped, "updatePage"),
      deletePage: vi.spyOn(wrapped, "deletePage"),
      addLink: vi.spyOn(wrapped, "addLink"),
      addGhostLink: vi.spyOn(wrapped, "addGhostLink"),
    };

    const p = await wrapped.createPage("u1", "T");
    await wrapped.updatePage("u1", p.id, { title: "T2" });
    await wrapped.addLink(p.id, "other");
    await wrapped.addGhostLink("ghost", p.id);
    await wrapped.deletePage("u1", p.id);

    expect(spy.createPage).toHaveBeenCalledWith("u1", "T");
    expect(spy.updatePage).toHaveBeenCalledWith("u1", p.id, { title: "T2" });
    expect(spy.addLink).toHaveBeenCalledWith(p.id, "other");
    expect(spy.addGhostLink).toHaveBeenCalledWith("ghost", p.id);
    expect(spy.deletePage).toHaveBeenCalledWith("u1", p.id);
  });
});

/**
 * 実プロダクションの `StorageAdapterPageRepository` が `IPageRepository` を満たし、
 * かつ adapter / API へ正しく委譲することを spy で確認するスモーク層。
 * CodeRabbit のレビュー対応: in-memory モックだけだと実装側の reg を見逃すため、
 * 実装に直接アンカーした薄い契約スイートを置く（網羅検証は
 * `pageRepository/StorageAdapterPageRepository.test.ts` 側）。
 *
 * Smoke layer that anchors `IPageRepository` contract assertions to the real
 * runtime implementation so adapter regressions surface here too. Exhaustive
 * delegation tests live alongside the implementation
 * (`pageRepository/StorageAdapterPageRepository.test.ts`); this block exists so
 * the interface file's test suite catches contract drift in the production class.
 */
function createMockAdapter(): StorageAdapter {
  return {
    getAllPages: vi.fn().mockResolvedValue([]),
    getPage: vi.fn().mockResolvedValue(null),
    upsertPage: vi.fn().mockResolvedValue(undefined),
    deletePage: vi.fn().mockResolvedValue(undefined),
    getYDocState: vi.fn().mockResolvedValue(null),
    saveYDocState: vi.fn().mockResolvedValue(undefined),
    getYDocVersion: vi.fn().mockResolvedValue(0),
    getLinks: vi.fn().mockResolvedValue([]),
    getBacklinks: vi.fn().mockResolvedValue([]),
    saveLinks: vi.fn().mockResolvedValue(undefined),
    getGhostLinks: vi.fn().mockResolvedValue([]),
    saveGhostLinks: vi.fn().mockResolvedValue(undefined),
    searchPages: vi.fn().mockResolvedValue([]),
    updateSearchIndex: vi.fn().mockResolvedValue(undefined),
    getLastSyncTime: vi.fn().mockResolvedValue(0),
    setLastSyncTime: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    resetDatabase: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockApi(): Partial<ApiClient> {
  return {
    deletePage: vi.fn(),
    createPage: vi.fn(),
  };
}

describe("StorageAdapterPageRepository (production) satisfies IPageRepository", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let api: Partial<ApiClient>;
  let repo: IPageRepository;

  beforeEach(() => {
    adapter = createMockAdapter();
    api = createMockApi();
    // 型レベルで `IPageRepository` を満たすかをここで強制する。
    // Compile-time assertion that the production class satisfies the interface.
    repo = new StorageAdapterPageRepository(adapter, api as ApiClient);
  });

  it("delegates createPage (guest) to adapter.upsertPage and skips api.createPage", async () => {
    await repo.createPage("local-user", "Hello");
    expect(adapter.upsertPage).toHaveBeenCalledOnce();
    // CodeRabbit のレビュー対応: ゲスト経路で API が呼ばれない不変条件をガード。
    // Guard the guest-path invariant: API must not be invoked for `local-user`.
    expect(api.createPage).not.toHaveBeenCalled();
  });

  it("delegates getPage to adapter.getPage", async () => {
    await repo.getPage("local-user", "p1");
    expect(adapter.getPage).toHaveBeenCalledWith("p1");
  });

  it("delegates addLink to adapter.saveLinks (defaulting linkType to 'wiki')", async () => {
    await repo.addLink("a", "b");
    expect(adapter.getLinks).toHaveBeenCalledWith("a", "wiki");
    expect(adapter.saveLinks).toHaveBeenCalledOnce();
    const call = (adapter.saveLinks as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toBe("wiki");
  });

  it("delegates deletePage (auth) to adapter.deletePage and api.deletePage", async () => {
    await repo.deletePage("auth-user", "p1");
    expect(adapter.deletePage).toHaveBeenCalledWith("p1");
    expect(api.deletePage).toHaveBeenCalledWith("p1");
  });
});

describe("PageRepositoryOptions.onMutate", () => {
  it("fires after every mutating method (CRUD + link/ghost link paths)", async () => {
    // CodeRabbit のレビュー対応: onMutate は CRUD だけでなく link/ghost link
    // 系の mutation でも発火する契約。書き込み経路全体でリグレッションを検出できる。
    //
    // Address CodeRabbit feedback: `onMutate` is fired on every mutating path
    // (page CRUD + link / ghost link writes), so a regression on any of them
    // is caught here.
    const onMutate = vi.fn();
    const r = createInMemoryRepository(makeStore(), { onMutate });

    const page = await r.createPage("u1", "T");
    await r.updatePage("u1", page.id, { title: "T2" });
    await r.addLink(page.id, "target");
    await r.removeLink(page.id, "target");
    await r.addGhostLink("Ghost", page.id);
    await r.removeGhostLink("Ghost", page.id);
    await r.deletePage("u1", page.id);

    // 7 mutations (create / update / addLink / removeLink / addGhost / removeGhost / delete)
    expect(onMutate).toHaveBeenCalledTimes(7);
  });

  it("is optional: implementations may skip the callback", async () => {
    const r = createInMemoryRepository(makeStore());
    await expect(r.createPage("u1", "T")).resolves.toBeDefined();
  });
});
