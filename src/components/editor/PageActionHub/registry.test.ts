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
  it("登録されているのは thumbnail.search と thumbnail.generate の 2 件 / exposes both thumbnail actions", () => {
    const ids = PAGE_ACTIONS.map((a) => a.id);
    expect(ids).toEqual(["thumbnail.search", "thumbnail.generate"]);
  });

  it("両アクションは insertStrategy=head / both thumbnail actions are head-insert", () => {
    for (const action of PAGE_ACTIONS) {
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
    const allow = getAvailablePageActions(makeCtx());
    expect(allow.map((a) => a.id)).toEqual(["thumbnail.search", "thumbnail.generate"]);

    const blockedReadOnly = getAvailablePageActions(makeCtx({ isReadOnly: true }));
    expect(blockedReadOnly).toEqual([]);

    const blockedThumb = getAvailablePageActions(makeCtx({ hasThumbnail: true }));
    expect(blockedThumb).toEqual([]);
  });

  it("getPageActionById は一致 ID の記述を返し、未知 ID は undefined / lookup behavior", () => {
    expect(getPageActionById("thumbnail.search")?.id).toBe("thumbnail.search");
    expect(getPageActionById("unknown.id")).toBeUndefined();
  });
});
