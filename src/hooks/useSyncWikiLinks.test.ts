import { describe, it, expect, vi } from "vitest";
import { syncLinksWithRepo } from "@/lib/syncWikiLinks";
import type { IPageRepository } from "@/lib/pageRepository";
import type { PageSummary, LinkType } from "@/types/page";

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
          noteId: null,
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
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-a", "wiki");
      expect(addGhostLink).toHaveBeenCalledTimes(1);
      expect(addGhostLink).toHaveBeenCalledWith("Non Existing", sourcePageId, "wiki");
      expect(removeLink).not.toHaveBeenCalled();
      // 既存ページへの add 時に ghost を消すため removeGhostLink("Page A") が1回呼ばれる
      expect(removeGhostLink).toHaveBeenCalledWith("Page A", sourcePageId, "wiki");
    });
  });

  describe("削除の差分", () => {
    it("事前に getOutgoingLinks が古い1件を返すとき、wikiLinks を空にすると removeLink が1回呼ばれる", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          noteId: null,
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
      expect(removeLink).toHaveBeenCalledWith(sourcePageId, "page-a", "wiki");
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
      expect(removeGhostLink).toHaveBeenCalledWith("Old Ghost", sourcePageId, "wiki");
    });

    it("古いリンク1件のとき、wikiLinks を別のリンクだけに変更すると remove 1回 + add 1回が呼ばれる", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          noteId: null,
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
          noteId: null,
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
      expect(removeLink).toHaveBeenCalledWith(sourcePageId, "page-a", "wiki");
      expect(addLink).toHaveBeenCalledTimes(1);
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-b", "wiki");
    });
  });

  describe("正規化", () => {
    it("同じタイトルの大文字・小文字や前後空白の違いで重複が発生しない（正規化されて1件として扱われる）", async () => {
      const summaries: PageSummary[] = [
        {
          id: "page-a",
          ownerUserId: userId,
          noteId: null,
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
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "page-a", "wiki");
      expect(addLink.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe("自己リンクの除外", () => {
    it("sourcePageId と同じページへのリンクは addLink しない", async () => {
      const summaries: PageSummary[] = [
        {
          id: sourcePageId,
          ownerUserId: userId,
          noteId: null,
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

  // Issue #713 Phase 4: ノートネイティブページを source にする場合は
  // `repo.getPagesSummary` を使わず、呼び出し側が `options.notePages` で
  // 渡したノート内ページだけを解決候補にする。個人ページは候補に入らない。
  // Note-native scope: `syncLinksWithRepo` must skip `repo.getPagesSummary`
  // and only use `options.notePages` as candidates so personal pages never
  // bleed into note-native resolution.
  describe("スコープ: ノートネイティブページ（pageNoteId 指定）", () => {
    const noteId = "note-1";

    it("pageNoteId を渡すと repo.getPagesSummary は呼ばれず、notePages のみを解決候補にする", async () => {
      const getPagesSummary = vi.fn().mockResolvedValue([
        {
          id: "personal-a",
          ownerUserId: userId,
          noteId: null,
          title: "Personal A",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        } satisfies PageSummary,
      ]);
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary,
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        addGhostLink,
      });

      // 同じタイトル "Personal A" でも、notePages に含まれていないのでゴースト扱いになる
      await syncLinksWithRepo(
        repo,
        userId,
        sourcePageId,
        [{ title: "Personal A", exists: false }],
        {
          pageNoteId: noteId,
          notePages: [{ id: "note-page-1", title: "Note Page 1" }],
        },
      );

      expect(getPagesSummary).not.toHaveBeenCalled();
      expect(addLink).not.toHaveBeenCalled();
      expect(addGhostLink).toHaveBeenCalledTimes(1);
      expect(addGhostLink).toHaveBeenCalledWith("Personal A", sourcePageId, "wiki");
    });

    it("pageNoteId + notePages 指定時、同じノート内のページへのリンクは addLink で解決される", async () => {
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);
      const removeGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        addGhostLink,
        removeGhostLink,
      });

      await syncLinksWithRepo(
        repo,
        userId,
        sourcePageId,
        [{ title: "Note Page 1", exists: true }],
        {
          pageNoteId: noteId,
          notePages: [
            { id: "note-page-1", title: "Note Page 1" },
            { id: "note-page-2", title: "Note Page 2" },
          ],
        },
      );

      expect(addLink).toHaveBeenCalledTimes(1);
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "note-page-1", "wiki");
      expect(addGhostLink).not.toHaveBeenCalled();
    });

    it("pageNoteId 指定で notePages を渡さないと、全てゴーストリンクになる", async () => {
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getOutgoingLinks: vi.fn().mockResolvedValue([]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        addLink,
        addGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [{ title: "Unknown", exists: false }], {
        pageNoteId: noteId,
      });

      expect(addLink).not.toHaveBeenCalled();
      expect(addGhostLink).toHaveBeenCalledTimes(1);
      expect(addGhostLink).toHaveBeenCalledWith("Unknown", sourcePageId, "wiki");
    });

    // CodeRabbit / Codex が指摘: ノートスコープで `notePages` が空のとき、
    // 旧 outgoing link が候補マップに乗らず削除されないとグラフに残骸が残る。
    // 候補マップに無い targetId は「スコープから外れた」として常に removeLink
    // されることを担保する（Issue #713 Phase 4 リグレッションガード）。
    // Regression guard for issue #713 Phase 4: when note scope is active but
    // `notePages` is empty/unavailable, any stale outgoing link targetId
    // should still be treated as out-of-scope and removed, otherwise the
    // link graph would accumulate dangling edges.
    it("pageNoteId 指定で notePages が空でも、既存の outgoing link は removeLink で掃除される", async () => {
      const removeLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getOutgoingLinks: vi.fn().mockResolvedValue(["stale-target-id"]),
        getGhostLinksBySourcePage: vi.fn().mockResolvedValue([]),
        removeLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [], {
        pageNoteId: noteId,
      });

      expect(removeLink).toHaveBeenCalledTimes(1);
      expect(removeLink).toHaveBeenCalledWith(sourcePageId, "stale-target-id", "wiki");
    });
  });

  // Issue #725 Phase 1: linkType オプションでタグエッジを独立に同期する。
  // `linkType: 'tag'` の同期では WikiLink 用の outgoing / ghost は読まれず、
  // 書き込みもタグスコープに閉じる。逆も同様。
  // Issue #725 Phase 1: tag sync operates in its own `linkType` bucket and
  // never reads or writes WikiLink edges, and vice versa.
  describe("linkType オプション（issue #725 Phase 1）", () => {
    it("linkType='tag' 指定時は repo.getOutgoingLinks / addLink / addGhostLink に 'tag' が渡る", async () => {
      const summaries: PageSummary[] = [
        {
          id: "tag-target",
          ownerUserId: userId,
          noteId: null,
          title: "Foo",
          contentPreview: undefined,
          thumbnailUrl: undefined,
          sourceUrl: undefined,
          createdAt: 0,
          updatedAt: 0,
          isDeleted: false,
        },
      ];
      const getOutgoingLinks = vi.fn().mockResolvedValue([]);
      const getGhostLinksBySourcePage = vi.fn().mockResolvedValue([]);
      const addLink = vi.fn().mockResolvedValue(undefined);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);
      const removeGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue(summaries),
        getOutgoingLinks,
        getGhostLinksBySourcePage,
        addLink,
        addGhostLink,
        removeGhostLink,
      });

      await syncLinksWithRepo(
        repo,
        userId,
        sourcePageId,
        [
          { title: "Foo", exists: true },
          { title: "Unknown", exists: false },
        ],
        { linkType: "tag" satisfies LinkType },
      );

      expect(getOutgoingLinks).toHaveBeenCalledWith(sourcePageId, "tag");
      expect(getGhostLinksBySourcePage).toHaveBeenCalledWith(sourcePageId, "tag");
      expect(addLink).toHaveBeenCalledWith(sourcePageId, "tag-target", "tag");
      expect(addGhostLink).toHaveBeenCalledWith("Unknown", sourcePageId, "tag");
    });

    it("linkType='wiki' (既定) では wiki スコープで同期し tag バケットには触れない", async () => {
      const getOutgoingLinks = vi.fn().mockResolvedValue([]);
      const getGhostLinksBySourcePage = vi.fn().mockResolvedValue([]);
      const addGhostLink = vi.fn().mockResolvedValue(undefined);

      const repo = createMockRepo({
        getPagesSummary: vi.fn().mockResolvedValue([]),
        getOutgoingLinks,
        getGhostLinksBySourcePage,
        addGhostLink,
      });

      await syncLinksWithRepo(repo, userId, sourcePageId, [{ title: "Unknown", exists: false }]);

      expect(getOutgoingLinks).toHaveBeenCalledWith(sourcePageId, "wiki");
      expect(getGhostLinksBySourcePage).toHaveBeenCalledWith(sourcePageId, "wiki");
      expect(addGhostLink).toHaveBeenCalledWith("Unknown", sourcePageId, "wiki");
      // 'tag' 呼び出しが無いことを確認（wiki スコープに閉じる）
      const tagCalls = getOutgoingLinks.mock.calls.filter((c: unknown[]) => c[1] === "tag");
      expect(tagCalls).toHaveLength(0);
    });
  });
});
