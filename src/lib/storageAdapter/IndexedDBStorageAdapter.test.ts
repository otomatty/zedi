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
