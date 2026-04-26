import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { PageMetadata } from "@/lib/storageAdapter/types";
import type { ApiClient } from "@/lib/api/apiClient";

// Dynamic import to reset module state between tests
let syncWithApi: typeof import("./syncWithApi").syncWithApi;
let getSyncStatus: typeof import("./syncWithApi").getSyncStatus;
let isSyncDisabledByErrors: typeof import("./syncWithApi").isSyncDisabledByErrors;
let resetSyncFailures: typeof import("./syncWithApi").resetSyncFailures;

function createMockAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
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
    ...overrides,
  };
}

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    upsertMe: vi.fn().mockResolvedValue({}),
    getSyncPages: vi.fn().mockResolvedValue({
      pages: [],
      links: [],
      ghost_links: [],
      server_time: new Date().toISOString(),
    }),
    postSyncPages: vi.fn().mockResolvedValue({
      server_time: new Date().toISOString(),
      conflicts: [],
    }),
    getPageContent: vi.fn().mockResolvedValue({ ydoc_state: "", version: 0 }),
    putPageContent: vi.fn().mockResolvedValue({ version: 1 }),
    createPage: vi.fn().mockResolvedValue({}),
    deletePage: vi.fn().mockResolvedValue({ deleted: true }),
    getNotes: vi.fn().mockResolvedValue([]),
    getNote: vi.fn().mockResolvedValue({}),
    getPublicNotes: vi.fn().mockResolvedValue({ official: [], notes: [] }),
    getNoteMembers: vi.fn().mockResolvedValue([]),
    createNote: vi.fn().mockResolvedValue({}),
    updateNote: vi.fn().mockResolvedValue({}),
    deleteNote: vi.fn().mockResolvedValue({ deleted: true }),
    addNotePage: vi.fn().mockResolvedValue({}),
    removeNotePage: vi.fn().mockResolvedValue({ removed: true }),
    addNoteMember: vi.fn().mockResolvedValue({}),
    removeNoteMember: vi.fn().mockResolvedValue({ removed: true }),
    updateNoteMember: vi.fn().mockResolvedValue({}),
    searchSharedNotes: vi.fn().mockResolvedValue({ results: [] }),
    clipFetchHtml: vi.fn().mockResolvedValue(""),
    ...overrides,
  } as ApiClient;
}

const TEST_USER_ID = "user-1";

describe("syncWithApi", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./syncWithApi");
    syncWithApi = mod.syncWithApi;
    getSyncStatus = mod.getSyncStatus;
    isSyncDisabledByErrors = mod.isSyncDisabledByErrors;
    resetSyncFailures = mod.resetSyncFailures;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── PULL ──────────────────────────────────────────────────────────────

  it("pulls server pages and stores them locally", async () => {
    const serverTime = "2025-06-01T00:00:00Z";
    const serverPage = {
      id: "p1",
      owner_id: TEST_USER_ID,
      source_page_id: null,
      title: "Server Page",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-05-01T00:00:00Z",
      is_deleted: false,
    };

    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [serverPage],
        links: [],
        ghost_links: [],
        server_time: serverTime,
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(adapter.upsertPage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", title: "Server Page" }),
    );
    expect(adapter.setLastSyncTime).toHaveBeenCalled();
  });

  it("skips server pages when local is newer (LWW pull protection)", async () => {
    const adapter = createMockAdapter({
      getPage: vi.fn().mockResolvedValue({
        id: "p1",
        ownerId: TEST_USER_ID,
        noteId: null,
        sourcePageId: null,
        title: "Local Version",
        contentPreview: null,
        thumbnailUrl: null,
        sourceUrl: null,
        createdAt: Date.now(),
        updatedAt: new Date("2025-12-01").getTime(),
        isDeleted: false,
      }),
    });
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "p1",
            owner_id: TEST_USER_ID,
            source_page_id: null,
            title: "Old Server",
            content_preview: null,
            thumbnail_url: null,
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            is_deleted: false,
          },
        ],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(adapter.upsertPage).not.toHaveBeenCalled();
  });

  it("saves pulled links grouped by source page", async () => {
    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [],
        links: [
          { source_id: "p1", target_id: "p2", created_at: "2025-01-01T00:00:00Z" },
          { source_id: "p1", target_id: "p3", created_at: "2025-01-01T00:00:00Z" },
        ],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    // Issue #725 Phase 1: saveLinks は (sourceId, links, linkType) の 3 引数で
    // 呼ばれる。wiki 種別の pull を確認する。
    // saveLinks takes `(sourceId, links, linkType)` since issue #725 Phase 1;
    // assert the wiki bucket specifically.
    expect(adapter.saveLinks).toHaveBeenCalledWith(
      "p1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "p1", targetId: "p2", linkType: "wiki" }),
        expect.objectContaining({ sourceId: "p1", targetId: "p3", linkType: "wiki" }),
      ]),
      "wiki",
    );
  });

  it("clears stale local links when pulled page has 0 links", async () => {
    const serverPage = {
      id: "p1",
      owner_id: TEST_USER_ID,
      source_page_id: null,
      title: "Page",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-05-01T00:00:00Z",
      is_deleted: false,
    };
    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [serverPage],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    // Issue #725 Phase 1 + ロールアウト安全: レスポンスに 1 行も `link_type`
    // が含まれない（pre-#725 のサーバ or レガシーキャッシュ）ときは wiki
    // バケットのみを touch し、tag バケットは保持する。tag バケットまで空保存
    // するとローカルの tag エッジを誤って消してしまう。
    //
    // Safety: when the pull payload carries no `link_type` at all (pre-#725
    // server / cached legacy response), only clear the `'wiki'` bucket. Tag
    // edges must be preserved so we do not wipe them during mixed-version
    // rollout.
    expect(adapter.saveLinks).toHaveBeenCalledWith("p1", [], "wiki");
    expect(adapter.saveLinks).not.toHaveBeenCalledWith("p1", [], "tag");
  });

  it("clears both wiki and tag buckets when response proves link_type is on the wire (issue #725 Phase 1 rollout safety)", async () => {
    // `res.links` に 1 行でも explicit な `link_type` があれば「サーバは link_type
    // を理解している」とみなし、同じページの他 linkType バケットも stale
    // クリアの対象にする。ここでは `link_type='tag'` の 1 行を別ソースで混ぜ、
    // `p1` については links 無しでも wiki / tag 両方が空保存されることを確認。
    //
    // If any row in the response carries an explicit `link_type`, we trust the
    // wire for every bucket and clear stale edges in all of them for every
    // pulled page, including pages whose slice happens to be empty.
    const serverPage = {
      id: "p1",
      owner_id: TEST_USER_ID,
      source_page_id: null,
      title: "Page",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-05-01T00:00:00Z",
      is_deleted: false,
    };
    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [serverPage],
        links: [
          {
            source_id: "other-page",
            target_id: "x",
            link_type: "tag",
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(adapter.saveLinks).toHaveBeenCalledWith("p1", [], "wiki");
    expect(adapter.saveLinks).toHaveBeenCalledWith("p1", [], "tag");
  });

  it("links の link_type を根拠に ghost_links 側も tag バケットをクリアする（ghost_links が空のとき stale タグゴーストが残らないこと） / clears tag ghost bucket using evidence from links even when ghost_links is empty (issue #725 Phase 1; Devin review)", async () => {
    // Devin review: links と ghost_links を独立に判定すると、`links` に
    // `link_type='tag'` があっても `ghost_links: []` のレスポンスでは
    // ghost の tag バケットがクリアされず stale が残る。レスポンス全体から
    // server の link_type サポートを推定し、両方のバケットで tag もクリア
    // 対象に含める必要がある。
    //
    // When `res.links` proves the server speaks `link_type`, the ghost_links
    // path must also clear the tag bucket — otherwise an empty ghost_links
    // array leaves stale local tag ghosts untouched.
    const serverPage = {
      id: "p1",
      owner_id: TEST_USER_ID,
      source_page_id: null,
      title: "Page",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-05-01T00:00:00Z",
      is_deleted: false,
    };
    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [serverPage],
        links: [
          {
            source_id: "other-page",
            target_id: "x",
            link_type: "tag",
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        // ghost_links は空（この配列単独では link_type 非対応に見える）
        // ghost_links empty (looks legacy on its own)
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    // saveGhostLinks も tag バケットで呼ばれることを検証。
    // saveGhostLinks must also be called for the tag bucket.
    expect(adapter.saveGhostLinks).toHaveBeenCalledWith("p1", [], "wiki");
    expect(adapter.saveGhostLinks).toHaveBeenCalledWith("p1", [], "tag");
  });

  it("preserves local thumbnailUrl when server returns null", async () => {
    const localPage: PageMetadata = {
      id: "p1",
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: "Page with thumbnail",
      contentPreview: "preview",
      thumbnailUrl: "/api/thumbnail/serve/abc123",
      sourceUrl: null,
      createdAt: new Date("2025-01-01").getTime(),
      updatedAt: new Date("2025-05-01").getTime(),
      isDeleted: false,
    };

    const adapter = createMockAdapter({
      getPage: vi.fn().mockResolvedValue(localPage),
      getAllPages: vi.fn().mockResolvedValue([localPage]),
      getLastSyncTime: vi.fn().mockResolvedValue(new Date("2025-04-01").getTime()),
    });
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "p1",
            owner_id: TEST_USER_ID,
            source_page_id: null,
            title: "Page with thumbnail",
            content_preview: "preview",
            thumbnail_url: null, // Server has no thumbnail
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-06-01T00:00:00Z", // Server is newer
            is_deleted: false,
          },
        ],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(adapter.upsertPage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p1",
        thumbnailUrl: "/api/thumbnail/serve/abc123", // Local thumbnail preserved
      }),
    );
  });

  it("uses server thumbnailUrl when server provides one", async () => {
    const localPage: PageMetadata = {
      id: "p1",
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: "Page",
      contentPreview: null,
      thumbnailUrl: "/api/thumbnail/serve/old",
      sourceUrl: null,
      createdAt: new Date("2025-01-01").getTime(),
      updatedAt: new Date("2025-05-01").getTime(),
      isDeleted: false,
    };

    const adapter = createMockAdapter({
      getPage: vi.fn().mockResolvedValue(localPage),
      getAllPages: vi.fn().mockResolvedValue([localPage]),
      getLastSyncTime: vi.fn().mockResolvedValue(new Date("2025-04-01").getTime()),
    });
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "p1",
            owner_id: TEST_USER_ID,
            source_page_id: null,
            title: "Page",
            content_preview: null,
            thumbnail_url: "/api/thumbnail/serve/new", // Server has a different thumbnail
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-06-01T00:00:00Z",
            is_deleted: false,
          },
        ],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(adapter.upsertPage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p1",
        thumbnailUrl: "/api/thumbnail/serve/new", // Server thumbnail used
      }),
    );
  });

  // ── PUSH ──────────────────────────────────────────────────────────────

  it("pushes locally modified pages to server", async () => {
    const localPage: PageMetadata = {
      id: "local-1",
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: "Local Page",
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    };

    const adapter = createMockAdapter({
      getLastSyncTime: vi.fn().mockResolvedValue(Date.now() - 60_000),
      getAllPages: vi.fn().mockResolvedValue([localPage]),
    });
    const api = createMockApi();

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(api.postSyncPages).toHaveBeenCalled();
  });

  it("sends links and ghost_links only in last chunk when pushing >100 pages", async () => {
    const PAGE_PUSH_CHUNK_SIZE = 100;
    const manyPages: PageMetadata[] = Array.from({ length: PAGE_PUSH_CHUNK_SIZE + 1 }, (_, i) => ({
      id: `page-${i}`,
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: `Page ${i}`,
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now() + i,
      isDeleted: false,
    }));

    const adapter = createMockAdapter({
      getLastSyncTime: vi.fn().mockResolvedValue(0),
      getAllPages: vi.fn().mockResolvedValue(manyPages),
      getLinks: vi.fn().mockImplementation((pageId: string) =>
        pageId === "page-0"
          ? Promise.resolve([
              {
                sourceId: "page-0",
                targetId: "page-1",
                linkType: "wiki",
                createdAt: Date.now(),
              },
            ])
          : Promise.resolve([]),
      ),
      getGhostLinks: vi.fn().mockResolvedValue([]),
    });
    const postSyncPages = vi.fn().mockResolvedValue({
      server_time: new Date().toISOString(),
      conflicts: [],
    });
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
      postSyncPages,
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(postSyncPages).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = postSyncPages.mock.calls;
    expect(firstCall[0].pages).toHaveLength(PAGE_PUSH_CHUNK_SIZE);
    expect(firstCall[0].links).toBeUndefined();
    expect(firstCall[0].ghost_links).toBeUndefined();
    expect(secondCall[0].pages).toHaveLength(1);
    expect(secondCall[0].links).toBeDefined();
    expect(secondCall[0].ghost_links).toBeDefined();
    // Issue #725 Phase 1: push payload carries `link_type` per link row.
    // Issue #725 Phase 1: push に `link_type` を含める。
    expect(secondCall[0].links[0]).toMatchObject({ link_type: "wiki" });
  });

  it("ローカルにタグエッジがある場合、push に link_type='tag' を含める / includes link_type='tag' on push when local has tag edges (issue #725 Phase 1)", async () => {
    const localPage: PageMetadata = {
      id: "p1",
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: "Local",
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    };
    const adapter = createMockAdapter({
      getLastSyncTime: vi.fn().mockResolvedValue(Date.now() - 60_000),
      getAllPages: vi.fn().mockResolvedValue([localPage]),
      getLinks: vi.fn().mockResolvedValue([
        { sourceId: "p1", targetId: "w", linkType: "wiki", createdAt: 1 },
        { sourceId: "p1", targetId: "t", linkType: "tag", createdAt: 2 },
      ]),
      getGhostLinks: vi
        .fn()
        .mockResolvedValue([
          { linkText: "NewTag", sourcePageId: "p1", linkType: "tag", createdAt: 3 },
        ]),
    });
    const postSyncPages = vi
      .fn()
      .mockResolvedValue({ server_time: new Date().toISOString(), conflicts: [] });
    const api = createMockApi({ postSyncPages });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(postSyncPages).toHaveBeenCalledTimes(1);
    const body = postSyncPages.mock.calls[0][0];
    expect(body.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: "p1", target_id: "w", link_type: "wiki" }),
        expect.objectContaining({ source_id: "p1", target_id: "t", link_type: "tag" }),
      ]),
    );
    expect(body.ghost_links).toEqual(
      expect.arrayContaining([expect.objectContaining({ link_text: "NewTag", link_type: "tag" })]),
    );
  });

  it("excludes note-native pages from push (issue #713 Phase 2 defensive filter)", async () => {
    // ノートネイティブページ（`noteId !== null`）は POST /api/sync/pages の LWW
    // 対象外。サーバー側でも skip されるが、フロント側でも push 前に除外することで
    // 余計なリクエストを発生させない。Issue #713 Phase 2。
    // Note-native rows (`noteId !== null`) are not part of personal-page sync.
    // Filter them out client-side too so we never put them on the wire even
    // when the server would skip them. Issue #713 Phase 2.
    const personalPage: PageMetadata = {
      id: "personal-1",
      ownerId: TEST_USER_ID,
      noteId: null,
      sourcePageId: null,
      title: "Personal",
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    };
    const noteNativePage: PageMetadata = {
      id: "note-native-1",
      ownerId: TEST_USER_ID,
      noteId: "note-1",
      sourcePageId: null,
      title: "Note-native (should not be pushed)",
      contentPreview: null,
      thumbnailUrl: null,
      sourceUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    };

    const adapter = createMockAdapter({
      getLastSyncTime: vi.fn().mockResolvedValue(Date.now() - 60_000),
      getAllPages: vi.fn().mockResolvedValue([personalPage, noteNativePage]),
    });
    const postSyncPages = vi
      .fn()
      .mockResolvedValue({ server_time: new Date().toISOString(), conflicts: [] });
    const api = createMockApi({ postSyncPages });

    await syncWithApi(adapter, api, TEST_USER_ID);

    expect(postSyncPages).toHaveBeenCalledTimes(1);
    const pushedIds = postSyncPages.mock.calls[0][0].pages.map((p: { id: string }) => p.id);
    expect(pushedIds).toEqual(["personal-1"]);
    expect(pushedIds).not.toContain("note-native-1");
  });

  it("propagates note_id from SyncPageItem into PageMetadata (defensive read)", async () => {
    // GET /api/sync/pages は現状個人ページしか返さないが、将来 `note_id` が
    // ワイヤに乗った場合に `PageMetadata.noteId` までそのまま伝わることを保証する。
    // Issue #713 Phase 2。
    // GET /api/sync/pages currently only returns personal pages, but if the
    // wire ever surfaces `note_id` we want it to land on `PageMetadata.noteId`
    // without further plumbing. Issue #713 Phase 2.
    const adapter = createMockAdapter();
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "p1",
            owner_id: TEST_USER_ID,
            note_id: null,
            source_page_id: null,
            title: "Personal",
            content_preview: null,
            thumbnail_url: null,
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-05-01T00:00:00Z",
            is_deleted: false,
          },
          {
            id: "p2",
            owner_id: TEST_USER_ID,
            note_id: "note-1",
            source_page_id: null,
            title: "Note-native (hypothetical)",
            content_preview: null,
            thumbnail_url: null,
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-05-01T00:00:00Z",
            is_deleted: false,
          },
        ],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID);

    const upsertMock = adapter.upsertPage as ReturnType<typeof vi.fn>;
    const upsertedById = new Map<string, PageMetadata>(
      upsertMock.mock.calls.map(([m]: [PageMetadata]) => [m.id, m]),
    );
    expect(upsertedById.get("p1")?.noteId).toBeNull();
    expect(upsertedById.get("p2")?.noteId).toBe("note-1");
  });

  it("skips push on initial sync when local was empty", async () => {
    const adapter = createMockAdapter({
      getAllPages: vi.fn().mockResolvedValue([]),
    });
    const api = createMockApi({
      getSyncPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "p1",
            owner_id: TEST_USER_ID,
            source_page_id: null,
            title: "S",
            content_preview: null,
            thumbnail_url: null,
            source_url: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            is_deleted: false,
          },
        ],
        links: [],
        ghost_links: [],
        server_time: new Date().toISOString(),
      }),
    });

    await syncWithApi(adapter, api, TEST_USER_ID, { forceFullSyncWhenLocalEmpty: true });

    expect(api.postSyncPages).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────────────

  it("increments consecutive failures on error", async () => {
    const adapter = createMockAdapter({
      initialize: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const api = createMockApi();

    await expect(syncWithApi(adapter, api, TEST_USER_ID)).rejects.toThrow("DB error");
    expect(getSyncStatus()).toBe("error");
  });

  it("stops automatic sync after 3 consecutive failures", async () => {
    const adapter = createMockAdapter({
      initialize: vi.fn().mockRejectedValue(new Error("fail")),
    });
    const api = createMockApi();

    for (let i = 0; i < 3; i++) {
      await syncWithApi(adapter, api, TEST_USER_ID).catch(() => {});
    }

    expect(isSyncDisabledByErrors()).toBe(true);

    // Should skip without throwing
    await syncWithApi(adapter, api, TEST_USER_ID);
  });

  it("allows manual sync (force) even after failures", async () => {
    const adapter = createMockAdapter({
      initialize: vi
        .fn()
        .mockRejectedValueOnce(new Error("1"))
        .mockRejectedValueOnce(new Error("2"))
        .mockRejectedValueOnce(new Error("3"))
        .mockResolvedValue(undefined),
    });
    const api = createMockApi();

    for (let i = 0; i < 3; i++) {
      await syncWithApi(adapter, api, TEST_USER_ID).catch(() => {});
    }

    expect(isSyncDisabledByErrors()).toBe(true);

    resetSyncFailures();
    expect(isSyncDisabledByErrors()).toBe(false);
  });

  it("prevents concurrent sync calls", async () => {
    let resolveSync: (() => void) | undefined;
    const blockingAdapter = createMockAdapter({
      initialize: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSync = resolve;
          }),
      ),
    });
    const api = createMockApi();

    const first = syncWithApi(blockingAdapter, api, TEST_USER_ID);
    const second = syncWithApi(blockingAdapter, api, TEST_USER_ID);

    resolveSync?.();
    await Promise.all([first, second]);

    expect(blockingAdapter.initialize).toHaveBeenCalledTimes(1);
  });

  // ── Status management ─────────────────────────────────────────────────

  it("transitions status: idle → syncing → synced", async () => {
    const statuses: string[] = [];
    const { subscribeSyncStatus } = await import("./syncWithApi");
    const unsub = subscribeSyncStatus((s) => statuses.push(s));

    const adapter = createMockAdapter();
    const api = createMockApi();
    await syncWithApi(adapter, api, TEST_USER_ID);

    unsub();
    expect(statuses).toContain("syncing");
    expect(statuses).toContain("synced");
  });
});
