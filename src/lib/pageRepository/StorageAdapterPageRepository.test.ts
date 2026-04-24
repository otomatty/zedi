import { describe, it, expect, beforeEach, vi } from "vitest";
import { StorageAdapterPageRepository } from "./StorageAdapterPageRepository";
import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { ApiClient } from "@/lib/api/apiClient";
import type { PageMetadata, Link } from "@/lib/storageAdapter/types";

vi.mock("@/lib/contentUtils", () => ({
  getPageListPreview: vi.fn((content: string) => (content ? content.slice(0, 50) : "")),
  extractPlainText: vi.fn((content: string) => content ?? ""),
}));

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
  };
}

function createMockApi(): ApiClient {
  return {
    upsertMe: vi.fn(),
    getSyncPages: vi.fn(),
    postSyncPages: vi.fn(),
    getPageContent: vi.fn(),
    putPageContent: vi.fn(),
    createPage: vi.fn(),
    deletePage: vi.fn(),
    getNotes: vi.fn(),
    getNote: vi.fn(),
    getPublicNotes: vi.fn(),
    getNoteMembers: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    addNotePage: vi.fn(),
    removeNotePage: vi.fn(),
    addNoteMember: vi.fn(),
    removeNoteMember: vi.fn(),
    updateNoteMember: vi.fn(),
    searchSharedNotes: vi.fn(),
    clipFetchHtml: vi.fn(),
  } as unknown as ApiClient;
}

const LOCAL_USER_ID = "local-user";
const AUTH_USER_ID = "auth-user-123";

describe("StorageAdapterPageRepository", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let api: ReturnType<typeof createMockApi>;
  let repo: StorageAdapterPageRepository;

  beforeEach(() => {
    adapter = createMockAdapter();
    api = createMockApi();
    repo = new StorageAdapterPageRepository(adapter, api);
  });

  describe("createPage", () => {
    it("creates page locally without API call for local user", async () => {
      const page = await repo.createPage(LOCAL_USER_ID, "Test Title", "");

      expect(adapter.upsertPage).toHaveBeenCalledOnce();
      expect(api.createPage).not.toHaveBeenCalled();
      expect(page.title).toBe("Test Title");
      expect(page.ownerUserId).toBe(LOCAL_USER_ID);
      expect(page.id).toBeTruthy();
    });

    it("calls API and stores in adapter for authenticated user", async () => {
      const now = new Date().toISOString();
      (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "api-page-1",
        owner_id: AUTH_USER_ID,
        title: "API Page",
        content_preview: "preview",
        source_page_id: null,
        thumbnail_url: null,
        source_url: null,
        created_at: now,
        updated_at: now,
        is_deleted: false,
      });

      const authRepo = new StorageAdapterPageRepository(adapter, api);
      const page = await authRepo.createPage(AUTH_USER_ID, "API Page", "body");

      expect(api.createPage).toHaveBeenCalledOnce();
      expect(adapter.upsertPage).toHaveBeenCalledOnce();
      expect(page.id).toBe("api-page-1");
      expect(page.ownerUserId).toBe(AUTH_USER_ID);
    });
  });

  describe("getPage", () => {
    it("retrieves page from adapter", async () => {
      const meta: PageMetadata = {
        id: "page-1",
        ownerId: LOCAL_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Hello",
        contentPreview: "preview",
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      };
      (adapter.getPage as ReturnType<typeof vi.fn>).mockResolvedValue(meta);

      const page = await repo.getPage(LOCAL_USER_ID, "page-1");
      expect(page).not.toBeNull();
      if (page) {
        expect(page.id).toBe("page-1");
        expect(page.title).toBe("Hello");
      }
    });

    it("returns null when page not found", async () => {
      const page = await repo.getPage(LOCAL_USER_ID, "nonexistent");
      expect(page).toBeNull();
    });
  });

  describe("getPages", () => {
    it("returns all pages from adapter", async () => {
      const pages: PageMetadata[] = [
        {
          id: "p1",
          ownerId: LOCAL_USER_ID,
          noteId: null,
          sourcePageId: null,
          title: "A",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: 1000,
          updatedAt: 2000,
          isDeleted: false,
        },
        {
          id: "p2",
          ownerId: LOCAL_USER_ID,
          noteId: null,
          sourcePageId: null,
          title: "B",
          contentPreview: null,
          thumbnailUrl: null,
          sourceUrl: null,
          createdAt: 1000,
          updatedAt: 2000,
          isDeleted: false,
        },
      ];
      (adapter.getAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(pages);

      const result = await repo.getPages(LOCAL_USER_ID);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("A");
      expect(result[1].title).toBe("B");
    });
  });

  describe("updatePage", () => {
    it("updates metadata in adapter", async () => {
      const existing: PageMetadata = {
        id: "page-1",
        ownerId: LOCAL_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Old Title",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      };
      (adapter.getPage as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      await repo.updatePage(LOCAL_USER_ID, "page-1", {
        title: "New Title",
      });

      expect(adapter.upsertPage).toHaveBeenCalledOnce();
      const saved = (adapter.upsertPage as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as PageMetadata;
      expect(saved.title).toBe("New Title");
      expect(saved.updatedAt).toBeGreaterThan(2000);
    });
  });

  describe("deletePage", () => {
    it("deletes only from adapter for local user", async () => {
      await repo.deletePage(LOCAL_USER_ID, "page-1");

      expect(adapter.deletePage).toHaveBeenCalledWith("page-1");
      expect(api.deletePage).not.toHaveBeenCalled();
    });

    it("deletes from adapter and API for authenticated user", async () => {
      const authRepo = new StorageAdapterPageRepository(adapter, api);
      await authRepo.deletePage(AUTH_USER_ID, "page-1");

      expect(adapter.deletePage).toHaveBeenCalledWith("page-1");
      expect(api.deletePage).toHaveBeenCalledWith("page-1");
    });
  });

  describe("addLink / removeLink", () => {
    it("adds a link via adapter (defaults linkType to 'wiki')", async () => {
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await repo.addLink("source-1", "target-1");

      expect(adapter.saveLinks).toHaveBeenCalledOnce();
      const call = (adapter.saveLinks as ReturnType<typeof vi.fn>).mock.calls[0];
      const saved = call[1] as Link[];
      const linkType = call[2] as string;
      expect(saved).toHaveLength(1);
      expect(saved[0].sourceId).toBe("source-1");
      expect(saved[0].targetId).toBe("target-1");
      expect(saved[0].linkType).toBe("wiki");
      expect(linkType).toBe("wiki");
    });

    it("adds a tag edge when linkType='tag' is passed (issue #725 Phase 1)", async () => {
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await repo.addLink("source-1", "target-1", "tag");

      expect(adapter.getLinks).toHaveBeenCalledWith("source-1", "tag");
      const call = (adapter.saveLinks as ReturnType<typeof vi.fn>).mock.calls[0];
      const saved = call[1] as Link[];
      const linkType = call[2] as string;
      expect(saved[0].linkType).toBe("tag");
      expect(linkType).toBe("tag");
    });

    it("addLink(wiki) does not wipe an existing tag edge on the same pair", async () => {
      // adapter.getLinks("source-1", "wiki") returns only the wiki row; the tag
      // row is in a separate linkType bucket so it is never read or written by
      // this call. 一方で tag バケットは触れない。
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockImplementation((_src, type) => {
        if (type === "wiki")
          return Promise.resolve([
            { sourceId: "s", targetId: "t", linkType: "wiki", createdAt: 1 },
          ]);
        return Promise.resolve([]);
      });

      await repo.addLink("s", "t", "wiki");

      // saveLinks called only for 'wiki' bucket (idempotent since row exists),
      // or not called if duplicate detection kicks in. Either way 'tag' bucket
      // is never touched. getLinks for 'tag' must not have been called from
      // this addLink.
      const tagCalls = (adapter.getLinks as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[1] === "tag",
      );
      expect(tagCalls).toHaveLength(0);
    });

    it("does not add duplicate link", async () => {
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { sourceId: "source-1", targetId: "target-1", linkType: "wiki", createdAt: 1000 },
      ]);

      await repo.addLink("source-1", "target-1");
      expect(adapter.saveLinks).not.toHaveBeenCalled();
    });

    it("removes a link via adapter", async () => {
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { sourceId: "s1", targetId: "t1", linkType: "wiki", createdAt: 1000 },
        { sourceId: "s1", targetId: "t2", linkType: "wiki", createdAt: 2000 },
      ]);

      await repo.removeLink("s1", "t1");

      const saved = (adapter.saveLinks as ReturnType<typeof vi.fn>).mock.calls[0][1] as Link[];
      expect(saved).toHaveLength(1);
      expect(saved[0].targetId).toBe("t2");
    });
  });

  describe("getBacklinks / getOutgoingLinks", () => {
    it("returns correct target IDs for outgoing links", async () => {
      (adapter.getLinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { sourceId: "p1", targetId: "p2", createdAt: 1000 },
        { sourceId: "p1", targetId: "p3", createdAt: 2000 },
      ]);

      const outgoing = await repo.getOutgoingLinks("p1");
      expect(outgoing).toEqual(["p2", "p3"]);
    });

    it("returns correct source IDs for backlinks", async () => {
      (adapter.getBacklinks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { sourceId: "p2", targetId: "p1", createdAt: 1000 },
        { sourceId: "p3", targetId: "p1", createdAt: 2000 },
      ]);

      const backlinks = await repo.getBacklinks("p1");
      expect(backlinks).toEqual(["p2", "p3"]);
    });
  });

  describe("checkDuplicateTitle", () => {
    const pages: PageMetadata[] = [
      {
        id: "p1",
        ownerId: LOCAL_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Unique Title",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      },
      {
        id: "p2",
        ownerId: LOCAL_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Another Title",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      },
    ];

    it("finds duplicate title", async () => {
      (adapter.getAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(pages);
      const dup = await repo.checkDuplicateTitle(LOCAL_USER_ID, "Unique Title");
      expect(dup).not.toBeNull();
      if (dup) expect(dup.id).toBe("p1");
    });

    it("excludes current page from duplicate check", async () => {
      (adapter.getAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(pages);
      const dup = await repo.checkDuplicateTitle(LOCAL_USER_ID, "Unique Title", "p1");
      expect(dup).toBeNull();
    });

    it("returns null when no duplicate found", async () => {
      (adapter.getAllPages as ReturnType<typeof vi.fn>).mockResolvedValue(pages);
      const dup = await repo.checkDuplicateTitle(LOCAL_USER_ID, "Nonexistent Title");
      expect(dup).toBeNull();
    });
  });

  describe("noteId passthrough (issue #713 Phase 2)", () => {
    // 個人ページ作成 (`createPage`) は常に `noteId = null` のメタデータを書き、
    // 取得系は adapter から渡された `noteId` をそのまま `Page` / `PageSummary`
    // に伝播させる。ノートネイティブページは `note-native` の値を保つ。
    //
    // `createPage` always writes personal-page metadata (`noteId = null`); read
    // paths surface whatever `noteId` the adapter returns into `Page` /
    // `PageSummary` unchanged so callers can scope behaviour without re-querying.

    it("createPage (local) writes noteId: null to the adapter", async () => {
      await repo.createPage(LOCAL_USER_ID, "Personal", "");
      const upsertMock = adapter.upsertPage as ReturnType<typeof vi.fn>;
      expect(upsertMock).toHaveBeenCalledOnce();
      const stored = upsertMock.mock.calls[0][0] as PageMetadata;
      expect(stored.noteId).toBeNull();
    });

    it("createPage (remote) defaults noteId to null when API omits it", async () => {
      const now = new Date().toISOString();
      (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "api-page-1",
        owner_id: AUTH_USER_ID,
        title: "API Page",
        content_preview: null,
        source_page_id: null,
        thumbnail_url: null,
        source_url: null,
        created_at: now,
        updated_at: now,
        is_deleted: false,
      });
      const page = await repo.createPage(AUTH_USER_ID, "API Page");
      expect(page.noteId).toBeNull();
      const upsertMock = adapter.upsertPage as ReturnType<typeof vi.fn>;
      const stored = upsertMock.mock.calls[0][0] as PageMetadata;
      expect(stored.noteId).toBeNull();
    });

    it("getPage / getPagesSummary forward adapter noteId verbatim", async () => {
      const personal: PageMetadata = {
        id: "p1",
        ownerId: LOCAL_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Personal",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      };
      const noteNative: PageMetadata = {
        id: "p2",
        ownerId: LOCAL_USER_ID,
        noteId: "note-1",
        sourcePageId: null,
        title: "Note-native",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: 1000,
        updatedAt: 2000,
        isDeleted: false,
      };

      (adapter.getPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(noteNative);
      const fetched = await repo.getPage(LOCAL_USER_ID, "p2");
      expect(fetched?.noteId).toBe("note-1");

      (adapter.getAllPages as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        personal,
        noteNative,
      ]);
      const summaries = await repo.getPagesSummary(LOCAL_USER_ID);
      const byId = new Map(summaries.map((s) => [s.id, s]));
      expect(byId.get("p1")?.noteId).toBeNull();
      expect(byId.get("p2")?.noteId).toBe("note-1");
    });
  });

  describe("importPersonalPageFromApi (issue #713 Phase 3, Codex P1)", () => {
    // 「ノート → 個人に取り込み」で生まれた新ページをサーバーレスポンスから直接 IDB に
    // 書き戻す経路をカバーする。こうすることで `/home` は次回 sync を待たずに表示可能。
    // `note_id` があるページ（ノートネイティブ）は個人 `/home` に属さないので拒否し、
    // 呼び出し側に `null` を返して誤書き込みを防ぐ。
    //
    // Exercises the write-through path used after "copy to personal": the server
    // response is persisted to IDB immediately so `/home` does not need to wait
    // for the next sync pull. Rows with `note_id != null` are note-native and do
    // not belong on personal `/home`; the helper returns `null` and skips the
    // adapter write so we cannot accidentally leak them into the personal grid.

    it("writes a personal page (`note_id: null`) through to the adapter and returns it", async () => {
      const nowIso = "2026-04-23T00:00:00.000Z";
      const page = await repo.importPersonalPageFromApi({
        id: "copy-1",
        owner_id: AUTH_USER_ID,
        note_id: null,
        source_page_id: "src-note-page",
        title: "Copied Page",
        content_preview: "preview",
        thumbnail_url: null,
        source_url: null,
        created_at: nowIso,
        updated_at: nowIso,
        is_deleted: false,
      });

      expect(page).not.toBeNull();
      expect(page?.id).toBe("copy-1");
      expect(page?.noteId).toBeNull();

      const upsertMock = adapter.upsertPage as ReturnType<typeof vi.fn>;
      expect(upsertMock).toHaveBeenCalledOnce();
      const stored = upsertMock.mock.calls[0][0] as PageMetadata;
      expect(stored).toMatchObject({
        id: "copy-1",
        ownerId: AUTH_USER_ID,
        noteId: null,
        sourcePageId: "src-note-page",
        title: "Copied Page",
        isDeleted: false,
      });
    });

    it("returns null and skips the adapter write when the page is note-native", async () => {
      // ノートネイティブページが誤って個人スコープの IDB に入らないことを保証する。
      // `/home` のフィルタは `note_id IS NULL` なので、ここを堅牢に弾くと二重防御になる。
      // Defensively reject note-native rows so they cannot slip into the
      // personal grid (whose filter is `note_id IS NULL`).
      const nowIso = "2026-04-23T00:00:00.000Z";
      const result = await repo.importPersonalPageFromApi({
        id: "note-native-1",
        owner_id: AUTH_USER_ID,
        note_id: "some-note",
        source_page_id: null,
        title: "Note-native",
        content_preview: null,
        thumbnail_url: null,
        source_url: null,
        created_at: nowIso,
        updated_at: nowIso,
        is_deleted: false,
      });

      expect(result).toBeNull();
      expect(adapter.upsertPage).not.toHaveBeenCalled();
    });
  });
});
