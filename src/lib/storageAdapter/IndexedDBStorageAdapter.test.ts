/**
 * Unit tests for IndexedDBStorageAdapter focused on the resetDatabase
 * abort-on-pageIds-failure behavior introduced for #608.
 *
 * IndexedDBStorageAdapter#resetDatabase の「pageIds 取得失敗時は中断」挙動 (#608) を検証する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexedDBStorageAdapter, ResetDatabasePageIdsReadError } from "./IndexedDBStorageAdapter";

interface MockOpenRequest {
  result: unknown;
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: ((event: { target: MockOpenRequest }) => void) | null;
}

interface MockDeleteRequest {
  error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

/**
 * Build a minimal mock IDBDatabase whose `transaction("my_pages", ...)` always
 * throws synchronously. Used to simulate a corrupted / unreadable main DB.
 *
 * `my_pages` への transaction が同期的に throw する IDBDatabase モック。
 * 主 DB が破損し読めない状況を再現する。
 */
function makeUnreadableDb(): IDBDatabase {
  return {
    transaction: vi.fn(() => {
      throw new Error("simulated transaction failure");
    }),
    close: vi.fn(),
  } as unknown as IDBDatabase;
}

describe("IndexedDBStorageAdapter.resetDatabase (issue #608)", () => {
  const originalIndexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  let openMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;
  let mockDb: IDBDatabase;

  beforeEach(() => {
    mockDb = makeUnreadableDb();

    openMock = vi.fn(() => {
      const req: MockOpenRequest = {
        result: mockDb,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      // Simulate the async open success after handlers are attached.
      // ハンドラ登録後に onsuccess を発火させる。
      queueMicrotask(() => req.onsuccess?.());
      return req as unknown as IDBOpenDBRequest;
    });

    deleteMock = vi.fn(() => {
      const req: MockDeleteRequest = {
        error: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => req.onsuccess?.());
      return req as unknown as IDBOpenDBRequest;
    });

    (globalThis as { indexedDB?: IDBFactory }).indexedDB = {
      open: openMock,
      deleteDatabase: deleteMock,
    } as unknown as IDBFactory;
  });

  afterEach(() => {
    if (originalIndexedDB === undefined) {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    } else {
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = originalIndexedDB;
    }
    vi.restoreAllMocks();
  });

  it("throws ResetDatabasePageIdsReadError and skips main DB deletion when page IDs cannot be read", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.initialize("user-1");

    await expect(adapter.resetDatabase()).rejects.toBeInstanceOf(ResetDatabasePageIdsReadError);

    // Critical guarantee for #608: main DB is NOT deleted when we cannot
    // enumerate per-page Y.Doc DBs, otherwise we would orphan them.
    // Y.Doc DB を孤児にしないため、pageIds 取得失敗時は主 DB も削除されないこと。
    expect(deleteMock).not.toHaveBeenCalled();

    // The main DB connection must remain open so a retry can succeed without
    // losing the only handle we have to enumerate page IDs.
    // 再試行で pageIds を再列挙できるよう、主 DB ハンドルは閉じない。
    expect(mockDb.close as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("preserves the underlying error as `originalError` for diagnostics", async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.initialize("user-2");

    try {
      await adapter.resetDatabase();
      throw new Error("expected resetDatabase to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ResetDatabasePageIdsReadError);
      const original = (err as ResetDatabasePageIdsReadError).originalError;
      expect(original).toBeInstanceOf(Error);
      expect(original?.message).toBe("simulated transaction failure");
    }
  });

  it("wraps non-Error causes (DOMException-like / strings) into Error for diagnostics", () => {
    // DOMException 等が Error を継承していない実行環境でも `originalError` を
    // Error に正規化することを確認する。Verify normalization to Error for
    // runtimes where DOMException does not extend Error.
    const stringCauseError = new ResetDatabasePageIdsReadError("disk quota exceeded");
    expect(stringCauseError.originalError).toBeInstanceOf(Error);
    expect(stringCauseError.originalError?.message).toBe("disk quota exceeded");

    const objectCause = { code: 42, name: "QuotaExceededError" };
    const objectCauseError = new ResetDatabasePageIdsReadError(objectCause);
    expect(objectCauseError.originalError).toBeInstanceOf(Error);

    const undefinedCauseError = new ResetDatabasePageIdsReadError(undefined);
    expect(undefinedCauseError.originalError).toBeUndefined();

    const nullCauseError = new ResetDatabasePageIdsReadError(null);
    expect(nullCauseError.originalError).toBeUndefined();
  });
});

/**
 * `my_pages` ストアだけを持つ最小のインメモリ IDBDatabase モック。
 * `getAll` / `openCursor` (+`cursor.update`) を実装し、Issue #1020 の
 * レガシー `noteId: null` 行の移行・除外ロジックを検証する。
 *
 * Minimal in-memory IDBDatabase mock exposing only `my_pages` with `getAll`
 * and `openCursor` (+ `cursor.update`), enough to exercise the issue #1020
 * legacy `noteId: null` migration / exclusion logic.
 */
function makePagesDb(rows: Array<Record<string, unknown>>): {
  db: IDBDatabase;
  data: Map<string, Record<string, unknown>>;
} {
  const data = new Map(rows.map((r) => [r.id as string, { ...r }]));

  function makeTransaction() {
    const tx: {
      oncomplete: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      error: null;
      objectStore: (name: string) => unknown;
    } = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
      objectStore: () => store,
    };

    const store = {
      getAll: () => {
        const req: { result?: unknown; onsuccess: (() => void) | null; onerror: null } = {
          onsuccess: null,
          onerror: null,
        };
        queueMicrotask(() => {
          req.result = [...data.values()].map((r) => ({ ...r }));
          req.onsuccess?.();
        });
        return req;
      },
      get: (id: string) => {
        const req: { result?: unknown; onsuccess: (() => void) | null; onerror: null } = {
          onsuccess: null,
          onerror: null,
        };
        queueMicrotask(() => {
          req.result = data.has(id) ? { ...data.get(id) } : undefined;
          req.onsuccess?.();
        });
        return req;
      },
      openCursor: () => {
        const ids = [...data.keys()];
        const req: { result: unknown; onsuccess: (() => void) | null; onerror: null } = {
          result: null,
          onsuccess: null,
          onerror: null,
        };
        let index = 0;
        const step = () => {
          if (index >= ids.length) {
            req.result = null;
            req.onsuccess?.();
            // 全行を走査し終えたら version-change なしの readwrite tx として
            // oncomplete を発火する。Fire oncomplete once iteration ends.
            queueMicrotask(() => tx.oncomplete?.());
            return;
          }
          const id = ids[index];
          index += 1;
          req.result = {
            value: { ...data.get(id) },
            update: (newRow: Record<string, unknown>) => {
              data.set(id, { ...newRow });
            },
            continue: () => queueMicrotask(step),
          };
          req.onsuccess?.();
        };
        queueMicrotask(step);
        return req;
      },
    };

    return tx;
  }

  const db = {
    transaction: vi.fn(() => makeTransaction()),
    close: vi.fn(),
  } as unknown as IDBDatabase;

  return { db, data };
}

describe("IndexedDBStorageAdapter legacy noteId:null rows (issue #1020)", () => {
  const originalIndexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  let userCounter = 0;

  /**
   * モック DB を `indexedDB.open` に差し込み、ユニークな userId で初期化済みの
   * adapter を返す。Install the mock DB behind `indexedDB.open` and return an
   * adapter initialized with a unique user id.
   */
  async function setupAdapter(rows: Array<Record<string, unknown>>) {
    const { db, data } = makePagesDb(rows);
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = {
      open: vi.fn(() => {
        const req: {
          result: unknown;
          onsuccess: (() => void) | null;
          onerror: null;
          onupgradeneeded: null;
        } = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => req.onsuccess?.());
        return req as unknown as IDBOpenDBRequest;
      }),
      deleteDatabase: vi.fn(),
    } as unknown as IDBFactory;

    const adapter = new IndexedDBStorageAdapter();
    userCounter += 1;
    await adapter.initialize(`legacy-user-${userCounter}`);
    return { adapter, data };
  }

  afterEach(async () => {
    // モジュールスコープの adapterDb を確実に解放する。Release the module-scoped handle.
    await new IndexedDBStorageAdapter().close();
    if (originalIndexedDB === undefined) {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    } else {
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = originalIndexedDB;
    }
    vi.restoreAllMocks();
  });

  const legacyRow = {
    id: "legacy-1",
    ownerId: "u",
    noteId: null,
    sourcePageId: null,
    title: "Legacy",
    contentPreview: null,
    thumbnailUrl: null,
    sourceUrl: null,
    createdAt: 1,
    updatedAt: 2,
    isDeleted: false,
  };
  const migratedRow = {
    ...legacyRow,
    id: "migrated-1",
    noteId: "note-default",
    title: "Migrated",
  };

  it("getAllPages / getPage exclude rows whose noteId is still null (pending migration)", async () => {
    const { adapter } = await setupAdapter([legacyRow, migratedRow]);

    const pages = await adapter.getAllPages();
    expect(pages.map((p) => p.id)).toEqual(["migrated-1"]);

    expect(await adapter.getPage("legacy-1")).toBeNull();
    expect((await adapter.getPage("migrated-1"))?.noteId).toBe("note-default");
  });

  it("reassignNullNotePages adopts null rows into the given note and leaves others untouched", async () => {
    const { adapter, data } = await setupAdapter([legacyRow, migratedRow]);

    await adapter.reassignNullNotePages("note-default");

    expect(data.get("legacy-1")?.noteId).toBe("note-default");
    expect(data.get("migrated-1")?.noteId).toBe("note-default");

    const pages = await adapter.getAllPages();
    expect(pages.map((p) => p.id).sort()).toEqual(["legacy-1", "migrated-1"]);
  });

  it("reassignNullNotePages also adopts v1 rows that lack the noteId field entirely", async () => {
    const v1Row = { ...legacyRow, id: "v1-1" } as Record<string, unknown>;
    delete v1Row.noteId;
    const { adapter, data } = await setupAdapter([v1Row]);

    await adapter.reassignNullNotePages("note-default");

    expect(data.get("v1-1")?.noteId).toBe("note-default");
  });
});
