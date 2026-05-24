import { describe, it, expect, vi } from "vitest";
import { PAGE_ACTIONS, getAvailablePageActions, getPageActionById } from "./registry";
import type { PageActionContext } from "./types";

function makeCtx(overrides: Partial<PageActionContext> = {}): PageActionContext {
  return {
    pageTitle: "Test Page",
    isReadOnly: false,
    isSignedIn: true,
    hasThumbnail: false,
    insertThumbnail: vi.fn(),
    ...overrides,
  };
}

describe("PageActionHub registry", () => {
  it("登録されているアクション ID / exposes registered action ids", () => {
    const ids = PAGE_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(["thumbnail.search", "thumbnail.generate", "wiki.compose"]);
  });

  it("サムネイル系は insertStrategy=head / thumbnail actions are head-insert", () => {
    for (const action of PAGE_ACTIONS.filter((a) => a.category === "thumbnail")) {
      expect(action.insertStrategy).toBe("head");
      expect(action.category).toBe("thumbnail");
    }
  });

  describe.each(["thumbnail.search", "thumbnail.generate"] as const)(
    "%s availability gates",
    (id) => {
      const action = PAGE_ACTIONS.find((a) => a.id === id);
      if (!action) throw new Error(`missing ${id}`);

      it("通常条件では利用可 / available under normal conditions", () => {
        expect(action.isAvailable(makeCtx())).toBe(true);
      });

      it("isReadOnly では不可 / blocked when read-only", () => {
        expect(action.isAvailable(makeCtx({ isReadOnly: true }))).toBe(false);
      });

      it("isSignedIn=false では不可 / blocked when signed out", () => {
        expect(action.isAvailable(makeCtx({ isSignedIn: false }))).toBe(false);
      });

      it("hasThumbnail=true では不可 / blocked when thumbnail already exists", () => {
        expect(action.isAvailable(makeCtx({ hasThumbnail: true }))).toBe(false);
      });

      it("タイトルが空白のみのときは不可 / blocked when title is empty/whitespace", () => {
        expect(action.isAvailable(makeCtx({ pageTitle: "   " }))).toBe(false);
        expect(action.isAvailable(makeCtx({ pageTitle: "" }))).toBe(false);
      });
    },
  );

  it("getAvailablePageActions は利用可能なアクションのみ返す / returns only available actions", () => {
    const allow = getAvailablePageActions(makeCtx({ wikiComposeHref: "/notes/n/p/compose" }));
    expect(allow.map((a) => a.id)).toEqual([
      "thumbnail.search",
      "thumbnail.generate",
      "wiki.compose",
    ]);

    const blockedReadOnly = getAvailablePageActions(makeCtx({ isReadOnly: true }));
    expect(blockedReadOnly).toEqual([]);

    const blockedThumb = getAvailablePageActions(
      makeCtx({ hasThumbnail: true, wikiComposeHref: "/notes/n/p/compose" }),
    );
    expect(blockedThumb.map((a) => a.id)).toEqual(["wiki.compose"]);
  });

  describe("wiki.compose availability gates", () => {
    const action = PAGE_ACTIONS.find((a) => a.id === "wiki.compose");
    if (!action) throw new Error("missing wiki.compose");

    it("wikiComposeHref があるとき利用可 / available when compose href is set", () => {
      expect(action.isAvailable(makeCtx({ wikiComposeHref: "/notes/n/p/compose" }))).toBe(true);
    });

    it("wikiComposeHref が無いときは不可 / blocked without compose href", () => {
      expect(action.isAvailable(makeCtx())).toBe(false);
    });

    it("タイトルが空のときは不可 / blocked when title is empty", () => {
      expect(
        action.isAvailable(makeCtx({ pageTitle: "", wikiComposeHref: "/notes/n/p/compose" })),
      ).toBe(false);
    });
  });

  it("getPageActionById は一致 ID の記述を返し、未知 ID は undefined / lookup behavior", () => {
    expect(getPageActionById("thumbnail.search")?.id).toBe("thumbnail.search");
    expect(getPageActionById("unknown.id")).toBeUndefined();
  });
});
