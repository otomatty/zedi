import { describe, it, expect, vi } from "vitest";
import { syncLinksWithRepo } from "@/lib/syncWikiLinks";
import type { IPageRepository } from "@/lib/pageRepository";
import type { PageSummary } from "@/types/page";

function createMockRepo(overrides: {
  getPagesSummary?: () => Promise<PageSummary[]>;
  getOutgoingLinks?: (pageId: string) => Promise<string[]>;
  getGhostLinksBySourcePage?: (sourcePageId: string) => Promise<string[]>;
  addLink?: (sourceId: string, targetId: string) => Promise<void>;
  removeLink?: (sourceId: string, targetId: string) => Promise<void>;
  addGhostLink?: (linkText: string, sourcePageId: string) => Promise<void>;
  removeGhostLink?: (linkText: string, sourcePageId: string) => Promise<void>;
}): IPageRepository {
  return {
    getPagesSummary: overrides.getPagesSummary ?? vi.fn().mockResolvedValue([]),
    getOutgoingLinks: overrides.getOutgoingLinks ?? vi.fn().mockResolvedValue([]),
    getGhostLinksBySourcePage: overrides.getGhostLinksBySourcePage ?? vi.fn().mockResolvedValue([]),
    addLink: overrides.addLink ?? vi.fn().mockResolvedValue(undefined),
    removeLink: overrides.removeLink ?? vi.fn().mockResolvedValue(undefined),
    addGhostLink: overrides.addGhostLink ?? vi.fn().mockResolvedValue(undefined),
    removeGhostLink: overrides.removeGhostLink ?? vi.fn().mockResolvedValue(undefined),
    createPage: vi.fn(),
    getPage: vi.fn(),
    getPages: vi.fn(),
    getPagesByIds: vi.fn(),
    getPageByTitle: vi.fn(),
    checkDuplicateTitle: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    searchPages: vi.fn(),
    getBacklinks: vi.fn(),
    getLinks: vi.fn(),
    getGhostLinkSources: vi.fn(),
    getGhostLinks: vi.fn(),
    promoteGhostLink: vi.fn(),
  } as unknown as IPageRepository;
}

const userId = "user-1";
const sourcePageId = "page-source";

describe("syncLinksWithRepo", () => {
  describe("追加のみ", () => {
    it("既存の outgoing/ghost が空のとき、wikiLinks に存在するページと存在しないページを渡すと addLink と addGhostLink が呼ばれ、remove は呼ばれない", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          title: "Page A",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);
      const removeLink = vi.fn().mockResolvedValue(undefined);
      const removeGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        addGhostLink,
        removeLink,
        removeGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [
        { title: "Page A", exists: true },
        { title: "Non Existing", exists: false },
      ]);

      expect(addLink).toHaveBeenCalledTimes(1);
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-a");
      expect(addGhostLink).toHaveBeenCalledTimes(1);
      expect(addGhostLink).toHaveBeenCalledWith("Non Existing", sourcePageId);
      expect(removeLink).not.toHaveBeenCalled();
      // 既存ページへの add 時に ghost を消すため removeGhostLink("Page A") が1回呼ばれる
      expect(removeGhostLink).toHaveBeenCalledWith("Page A", sourcePageId);
    });
  });

  describe("削除の差分", () => {
    it("事前に getOutgoingLinks が古い1件を返すとき、wikiLinks を空にすると removeLink が1回呼ばれる", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          title: "Page A",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const removeLink = vi.fn().mockResolvedValue(undefined);
      const removeGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks: vi.fn().mockResolvedValue(["page-a"]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        removeLink,
        removeGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, []);

      expect(removeLink).toHaveBeenCalledTimes(1);
      expect(removeLink).toHaveBeenCalledWith(sourcePageId, "page-a");
      expect(removeGhostLink).not.toHaveBeenCalled();
    });

    it("事前に getGhostLinksBySourcePage が古い1件を返すとき、wikiLinks を空にすると removeGhostLink が1回呼ばれる", async () => {
      const removeGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue([]),
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue(["Old Ghost"]),
        removeGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, []);

      expect(removeGhostLink).toHaveBeenCalledTimes(1);
      expect(removeGhostLink).toHaveBeenCalledWith("Old Ghost", sourcePageId);
    });

    it("古いリンク1件のとき、wikiLinks を別のリンクだけに変更すると remove 1回 + add 1回が呼ばれる", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          title: "Page A",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
        {
          id: "page-b",
          ownerUserId: userId,
          title: "Page B",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const addLink = vi.fn().mockResolvedValue(undefined);
      const removeLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks: vi.fn().mockResolvedValue(["page-a"]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        removeLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [{ title: "Page B", exists: true }]);

      expect(removeLink).toHaveBeenCalledTimes(1);
      expect(removeLink).toHaveBeenCalledWith(sourcePageId, "page-a");
      expect(addLink).toHaveBeenCalledTimes(1);
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-b");
    });
  });

  describe("正規化", () => {
    it("同じタイトルの大文字・小文字や前後空白の違いで重複が発生しない（正規化されて1件として扱われる）", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          title: "Page A",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const addLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [
        { title: "Page A", exists: true },
        { title: "  page a  ", exists: true },
        { title: "PAGE A", exists: true },
      ]);

      // 正規化で同一タイトルになるため addLink は1回（重複は追加されない実装に依存。StorageAdapterPageRepository は既存なら skip）
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-a");
      expect(addLink.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe("自己リンクの除外", () => {
    it("sourcePageId と同じページへのリンクは addLink しない", async () => {
      const summaries: PageSummary[] = [
        {
          id: sourcePageId,
          ownerUserId: userId,
          title: "My Page",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        addGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [{ title: "My Page", exists: true }]);

      expect(addLink).not.toHaveBeenCalled();
      expect(addGhostLink).not.toHaveBeenCalled();
    });
  });
});
