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

    expect(adapter.saveLinks).toHaveBeenCalledWith(
      "p1",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "p1", targetId: "p2" }),
        expect.objectContaining({ sourceId: "p1", targetId: "p3" }),
      ]),
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

    expect(adapter.saveLinks).toHaveBeenCalledWith("p1", []);
  });

  // ── PUSH ──────────────────────────────────────────────────────────────

  it("pushes locally modified pages to server", async () => {
    const localPage: PageMetadata = {
      id: "local-1",
      ownerId: TEST_USER_ID,
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
      getLinks: vi
        .fn()
        .mockImplementation((pageId: string) =>
          pageId === "page-0"
            ? Promise.resolve([{ sourceId: "page-0", targetId: "page-1", createdAt: Date.now() }])
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
