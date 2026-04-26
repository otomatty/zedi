import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "@testing-library/react";
import { usePageStore } from "./pageStore";

/**
 * pageStore はゲストセッション向けの zustand + persist ストア。
 * 各テストで `setState` でリセットし、localStorage も明示的にクリアする。
 *
 * pageStore is the zustand + persist guest store. Reset state via `setState`
 * and clear localStorage between tests so persisted data does not leak.
 */
function resetStore(): void {
  act(() => {
    usePageStore.setState({ pages: [], links: [], ghostLinks: [] });
  });
}

describe("pageStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  describe("createPage", () => {
    it("creates a personal page with default empty title and content", () => {
      const before = Date.now() - 1;
      const page = usePageStore.getState().createPage();

      expect(page.id).toBeTruthy();
      expect(page.title).toBe("");
      expect(page.content).toBe("");
      expect(page.ownerUserId).toBe("local-user");
      expect(page.noteId).toBeNull();
      expect(page.isDeleted).toBe(false);
      expect(page.createdAt).toBeGreaterThan(before);
      expect(page.updatedAt).toBe(page.createdAt);

      expect(usePageStore.getState().pages).toHaveLength(1);
      expect(usePageStore.getState().pages[0]).toEqual(page);
    });

    it("prepends newly created pages to the list", () => {
      const first = usePageStore.getState().createPage("first");
      const second = usePageStore.getState().createPage("second");

      const ids = usePageStore.getState().pages.map((p) => p.id);
      expect(ids).toEqual([second.id, first.id]);
    });

    it("persists created pages to localStorage", () => {
      usePageStore.getState().createPage("Persisted", "body");

      const raw = localStorage.getItem("zedi-pages");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string) as { state: { pages: Array<{ title: string }> } };
      expect(parsed.state.pages[0].title).toBe("Persisted");
    });
  });

  describe("updatePage", () => {
    it("merges updates and bumps updatedAt", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(1_000_000));
        const page = usePageStore.getState().createPage("orig", "body");
        vi.setSystemTime(new Date(2_000_000));

        usePageStore.getState().updatePage(page.id, { title: "updated" });

        const stored = usePageStore.getState().getPage(page.id);
        expect(stored?.title).toBe("updated");
        expect(stored?.content).toBe("body");
        expect(stored?.updatedAt).toBe(2_000_000);
      } finally {
        vi.useRealTimers();
      }
    });

    it("is a no-op for an unknown id", () => {
      const page = usePageStore.getState().createPage("orig");
      const before = usePageStore.getState().pages;

      usePageStore.getState().updatePage("missing", { title: "x" });

      expect(usePageStore.getState().pages).toEqual(before);
      expect(usePageStore.getState().getPage(page.id)?.title).toBe("orig");
    });
  });

  describe("deletePage", () => {
    it("marks the page as deleted and drops attached links", () => {
      const a = usePageStore.getState().createPage("A");
      const b = usePageStore.getState().createPage("B");
      const c = usePageStore.getState().createPage("C");

      usePageStore.getState().addLink(a.id, b.id);
      usePageStore.getState().addLink(c.id, a.id);
      usePageStore.getState().addLink(b.id, c.id);

      usePageStore.getState().deletePage(a.id);

      const state = usePageStore.getState();
      expect(state.pages.find((p) => p.id === a.id)?.isDeleted).toBe(true);
      // a を含むリンクは消え、b → c のリンクだけ残る
      // links touching a are removed; b → c survives
      expect(state.links).toEqual([
        expect.objectContaining({ sourceId: b.id, targetId: c.id, linkType: "wiki" }),
      ]);
    });

    it("hides deleted pages from getPage / getPageByTitle", () => {
      const page = usePageStore.getState().createPage("Hidden");
      usePageStore.getState().deletePage(page.id);

      expect(usePageStore.getState().getPage(page.id)).toBeUndefined();
      expect(usePageStore.getState().getPageByTitle("Hidden")).toBeUndefined();
    });
  });

  describe("getPage / getPageByTitle", () => {
    it("returns undefined for a missing id", () => {
      expect(usePageStore.getState().getPage("missing")).toBeUndefined();
    });

    it("getPageByTitle is case-insensitive and trims whitespace", () => {
      const page = usePageStore.getState().createPage("Hello World");
      expect(usePageStore.getState().getPageByTitle("  hello world  ")?.id).toBe(page.id);
      expect(usePageStore.getState().getPageByTitle("HELLO WORLD")?.id).toBe(page.id);
    });
  });

  describe("addLink / removeLink", () => {
    it("adds a wiki link by default and de-duplicates repeat inserts", () => {
      usePageStore.getState().addLink("a", "b");
      usePageStore.getState().addLink("a", "b");

      expect(usePageStore.getState().links).toEqual([
        expect.objectContaining({ sourceId: "a", targetId: "b", linkType: "wiki" }),
      ]);
    });

    it("treats wiki and tag edges on the same pair as distinct rows (issue #725)", () => {
      usePageStore.getState().addLink("a", "b", "wiki");
      usePageStore.getState().addLink("a", "b", "tag");

      expect(usePageStore.getState().links).toHaveLength(2);
      const types = usePageStore.getState().links.map((l) => l.linkType);
      expect(types.sort()).toEqual(["tag", "wiki"]);
    });

    it("removeLink only deletes rows of the matching linkType", () => {
      usePageStore.getState().addLink("a", "b", "wiki");
      usePageStore.getState().addLink("a", "b", "tag");

      usePageStore.getState().removeLink("a", "b", "wiki");

      expect(usePageStore.getState().links).toEqual([
        expect.objectContaining({ sourceId: "a", targetId: "b", linkType: "tag" }),
      ]);
    });
  });

  describe("getOutgoingLinks / getBacklinks", () => {
    it("filters by linkType (default 'wiki')", () => {
      usePageStore.getState().addLink("a", "b", "wiki");
      usePageStore.getState().addLink("a", "c", "wiki");
      usePageStore.getState().addLink("a", "d", "tag");

      expect(usePageStore.getState().getOutgoingLinks("a").sort()).toEqual(["b", "c"]);
      expect(usePageStore.getState().getOutgoingLinks("a", "tag")).toEqual(["d"]);
    });

    it("getBacklinks returns sources pointing at the page", () => {
      usePageStore.getState().addLink("p1", "target");
      usePageStore.getState().addLink("p2", "target");
      usePageStore.getState().addLink("p3", "other");

      expect(usePageStore.getState().getBacklinks("target").sort()).toEqual(["p1", "p2"]);
      expect(usePageStore.getState().getBacklinks("other")).toEqual(["p3"]);
    });
  });

  describe("ghost links", () => {
    it("addGhostLink de-duplicates and supports linkType scoping", () => {
      usePageStore.getState().addGhostLink("Topic", "p1");
      usePageStore.getState().addGhostLink("Topic", "p1");
      usePageStore.getState().addGhostLink("Topic", "p1", "tag");

      expect(usePageStore.getState().ghostLinks).toHaveLength(2);
    });

    it("removeGhostLink only deletes the matching (text, source, type) tuple", () => {
      usePageStore.getState().addGhostLink("Topic", "p1");
      usePageStore.getState().addGhostLink("Topic", "p2");

      usePageStore.getState().removeGhostLink("Topic", "p1");

      expect(usePageStore.getState().ghostLinks).toEqual([
        expect.objectContaining({ linkText: "Topic", sourcePageId: "p2", linkType: "wiki" }),
      ]);
    });

    it("getGhostLinkSources collects pages by linkText + linkType", () => {
      usePageStore.getState().addGhostLink("Topic", "p1");
      usePageStore.getState().addGhostLink("Topic", "p2");
      usePageStore.getState().addGhostLink("Topic", "p3", "tag");

      expect(usePageStore.getState().getGhostLinkSources("Topic").sort()).toEqual(["p1", "p2"]);
      expect(usePageStore.getState().getGhostLinkSources("Topic", "tag")).toEqual(["p3"]);
    });

    it("promoteGhostLink only promotes when 2+ sources exist for the wiki bucket", () => {
      usePageStore.getState().addGhostLink("Solo", "p1");
      expect(usePageStore.getState().promoteGhostLink("Solo")).toBeNull();

      usePageStore.getState().addGhostLink("Pair", "p1");
      usePageStore.getState().addGhostLink("Pair", "p2");

      const promoted = usePageStore.getState().promoteGhostLink("Pair");
      expect(promoted).not.toBeNull();
      expect(promoted?.title).toBe("Pair");

      const state = usePageStore.getState();
      // ゴーストは消費され、各ソースから新ページへの実リンクが張られる
      // ghosts consumed; real links from each source to the promoted page exist
      expect(state.ghostLinks.find((g) => g.linkText === "Pair")).toBeUndefined();
      const targets = state.links.filter((l) => l.targetId === promoted?.id).map((l) => l.sourceId);
      expect(targets.sort()).toEqual(["p1", "p2"]);
    });

    it("promoteGhostLink ignores tag-only ghosts (issue #725 Phase 1)", () => {
      usePageStore.getState().addGhostLink("Tagged", "p1", "tag");
      usePageStore.getState().addGhostLink("Tagged", "p2", "tag");

      expect(usePageStore.getState().promoteGhostLink("Tagged")).toBeNull();
      expect(usePageStore.getState().pages).toHaveLength(0);
    });
  });

  describe("searchPages", () => {
    beforeEach(() => {
      usePageStore.getState().createPage("Hello World", "first body");
      usePageStore.getState().createPage("Other", "contains hello");
      usePageStore.getState().createPage("Trash", "ignored");
    });

    it("returns title and content matches case-insensitively", () => {
      const results = usePageStore.getState().searchPages("HELLO");
      expect(results.map((p) => p.title).sort()).toEqual(["Hello World", "Other"]);
    });

    it("returns [] for a blank query", () => {
      expect(usePageStore.getState().searchPages("   ")).toEqual([]);
    });

    it("excludes soft-deleted pages from search results", () => {
      const target = usePageStore.getState().getPageByTitle("Hello World");
      if (!target) throw new Error("fixture page missing");
      usePageStore.getState().deletePage(target.id);

      const results = usePageStore.getState().searchPages("hello");
      expect(results.map((p) => p.title)).toEqual(["Other"]);
    });
  });

  describe("persist migrate", () => {
    /**
     * persist の `migrate` は zustand 内部から呼ばれる private 関数なので、ここでは
     * 永続化キーに古いバージョンの payload を直接書き、ストアを `rehydrate` で
     * 再水和して結果を確認する。
     *
     * `migrate` is invoked internally by zustand. We seed localStorage with an
     * older-versioned payload and trigger `rehydrate()` to validate the upgrade.
     */
    it("backfills missing noteId to null (v1 → v2)", async () => {
      localStorage.setItem(
        "zedi-pages",
        JSON.stringify({
          version: 1,
          state: {
            pages: [
              {
                id: "old-1",
                ownerUserId: "local-user",
                title: "Legacy",
                content: "",
                createdAt: 1,
                updatedAt: 1,
                isDeleted: false,
              },
            ],
            links: [],
            ghostLinks: [],
          },
        }),
      );

      await usePageStore.persist.rehydrate();

      const page = usePageStore.getState().pages.find((p) => p.id === "old-1");
      expect(page?.noteId).toBeNull();
    });

    it("backfills missing linkType to 'wiki' for links and ghost links (v2 → v3)", async () => {
      localStorage.setItem(
        "zedi-pages",
        JSON.stringify({
          version: 2,
          state: {
            pages: [],
            links: [{ sourceId: "a", targetId: "b", createdAt: 1 }],
            ghostLinks: [{ linkText: "X", sourcePageId: "a", createdAt: 1 }],
          },
        }),
      );

      await usePageStore.persist.rehydrate();

      const state = usePageStore.getState();
      expect(state.links[0].linkType).toBe("wiki");
      expect(state.ghostLinks[0].linkType).toBe("wiki");
    });
  });
});
