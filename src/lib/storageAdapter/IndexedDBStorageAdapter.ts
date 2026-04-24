/**
 * IndexedDB-backed StorageAdapter for Web (§6.2 zedi-rearchitecture-spec.md).
 * C3-2: my_pages, y-indexeddb (zedi-doc-pageId), my_links, my_ghost_links, search_index, meta.
 */

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { StorageAdapter } from "./StorageAdapter";
import type { PageMetadata, Link, GhostLink, LinkType, SearchResult } from "./types";

const DB_NAME_PREFIX = "zedi-storage-";
// v2: add `noteId` column on `my_pages` to mirror Aurora `pages.note_id`
//     (issue #713). v1 rows are upgraded in place by `onupgradeneeded` —
//     existing rows are personal pages, so `noteId = null` is the correct
//     backfill value.
// v3: add `linkType` to `my_links` / `my_ghost_links` (issue #725 Phase 1).
//     Key paths change to include `linkType` so the same (source, target)
//     pair can hold independent wiki and tag edges. Existing rows are
//     backfilled to `linkType: 'wiki'` — see `migrateLinksToV3`.
//
// v2: `pages.note_id` (issue #713) を反映するため `my_pages` に `noteId` 列を
// 追加。v1 の既存行は全て個人ページなので、`onupgradeneeded` で `noteId = null`
// を埋めれば移行完了。
// v3: `my_links` / `my_ghost_links` に `linkType` を追加（issue #725 Phase 1）。
// 同一 (source, target) ペアでも WikiLink エッジとタグエッジを独立に保持できる
// よう、キーパスに `linkType` を含める。既存行は `linkType: 'wiki'` で埋め直す。
const DB_VERSION = 3;
const YDOC_NAME_PREFIX = "zedi-doc-";

/** Stored page row (camelCase for consistency with PageMetadata). */
interface StoredPage {
  id: string;
  ownerId: string;
  /**
   * 所属ノート ID。`null` は個人ページ、文字列値はノートネイティブページ。
   * Web 版の同期パスは個人ページしか持ち込まないので、実運用では常に `null`。
   *
   * Owning note ID; `null` is a personal page. The web sync path only ever
   * imports personal pages, so this is always `null` in practice.
   */
  noteId: string | null;
  sourcePageId: string | null;
  title: string | null;
  contentPreview: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/** Stored link row. `linkType` added in v3 (issue #725 Phase 1). */
interface StoredLink {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  createdAt: number;
}

/** Stored ghost link row. `linkType` added in v3 (issue #725 Phase 1). */
interface StoredGhostLink {
  linkText: string;
  sourcePageId: string;
  linkType: LinkType;
  createdAt: number;
  originalTargetPageId?: string | null;
  originalNoteId?: string | null;
}

/** Meta row for lastSyncTime. */
interface MetaRow {
  key: string;
  value: number;
}

function pageToStored(p: PageMetadata): StoredPage {
  return {
    id: p.id,
    ownerId: p.ownerId,
    noteId: p.noteId ?? null,
    sourcePageId: p.sourcePageId ?? null,
    title: p.title ?? null,
    contentPreview: p.contentPreview ?? null,
    thumbnailUrl: p.thumbnailUrl ?? null,
    sourceUrl: p.sourceUrl ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isDeleted: p.isDeleted,
  };
}

function storedToPage(s: StoredPage): PageMetadata {
  // v1 で永続化された行は `noteId` を持たない。`null` を返して個人ページ扱いに
  // 揃える。Issue #713。
  // Rows persisted under v1 lack `noteId`; coerce to `null` so they read as
  // personal pages. Issue #713.
  return { ...s, noteId: s.noteId ?? null };
}

function ensureDb(): Promise<IDBDatabase> {
  if (!adapterDb)
    throw new Error("IndexedDBStorageAdapter: not initialized. Call initialize(userId) first.");
  return Promise.resolve(adapterDb);
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME_PREFIX + userId, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction;
      if (!db.objectStoreNames.contains("my_pages")) {
        const pages = db.createObjectStore("my_pages", { keyPath: "id" });
        pages.createIndex("updated_at", "updatedAt", { unique: false });
        pages.createIndex("created_at", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("my_links")) {
        const links = db.createObjectStore("my_links", {
          keyPath: ["sourceId", "targetId", "linkType"],
        });
        links.createIndex("by_source", "sourceId", { unique: false });
        links.createIndex("by_target", "targetId", { unique: false });
        links.createIndex("by_source_type", ["sourceId", "linkType"], { unique: false });
      }
      if (!db.objectStoreNames.contains("my_ghost_links")) {
        const ghost = db.createObjectStore("my_ghost_links", {
          keyPath: ["linkText", "sourcePageId", "linkType"],
        });
        ghost.createIndex("by_source", "sourcePageId", { unique: false });
        ghost.createIndex("by_source_type", ["sourcePageId", "linkType"], { unique: false });
      }
      if (!db.objectStoreNames.contains("search_index")) {
        db.createObjectStore("search_index", { keyPath: "pageId" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("ydoc_versions")) {
        db.createObjectStore("ydoc_versions", { keyPath: "pageId" });
      }

      // v2 (issue #713): backfill `noteId = null` on existing rows and add a
      // `by_note` index so future queries can scope by note. v1 only ever
      // stored personal pages, so `null` is the correct historical value.
      //
      // v2 (issue #713): 既存行は全て個人ページなので `noteId = null` を埋め、
      // 将来のクエリで note 単位に絞れるよう `by_note` index を作る。
      if (event.oldVersion < 2 && tx) {
        const pagesStore = tx.objectStore("my_pages");
        if (!pagesStore.indexNames.contains("by_note")) {
          pagesStore.createIndex("by_note", "noteId", { unique: false });
        }
        const cursorReq = pagesStore.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const row = cursor.value as Partial<StoredPage>;
          if (row.noteId === undefined) {
            cursor.update({ ...row, noteId: null });
          }
          cursor.continue();
        };
      }

      // v3 (issue #725 Phase 1): recreate `my_links` / `my_ghost_links` with a
      // wider key path (`linkType` appended) and backfill existing rows with
      // `linkType: 'wiki'`. IndexedDB cannot mutate an existing keyPath, so we
      // read, delete, recreate, and re-insert.
      //
      // v3 (issue #725 Phase 1): `my_links` / `my_ghost_links` のキーパスに
      // `linkType` を足す必要があるが、IndexedDB はキーパスを変えられないので、
      // 一旦読み出し → ストア再作成 → `linkType: 'wiki'` で書き戻す。
      if (event.oldVersion < 3 && tx) {
        migrateLinkStoreToV3(db, tx, "my_links", ["sourceId", "targetId"], (row) => ({
          store: "my_links",
          keyPath: ["sourceId", "targetId", "linkType"],
          indexes: [
            { name: "by_source", keyPath: "sourceId" },
            { name: "by_target", keyPath: "targetId" },
            { name: "by_source_type", keyPath: ["sourceId", "linkType"] },
          ],
          value: { ...row, linkType: "wiki" as LinkType },
        }));
        migrateLinkStoreToV3(db, tx, "my_ghost_links", ["linkText", "sourcePageId"], (row) => ({
          store: "my_ghost_links",
          keyPath: ["linkText", "sourcePageId", "linkType"],
          indexes: [
            { name: "by_source", keyPath: "sourcePageId" },
            { name: "by_source_type", keyPath: ["sourcePageId", "linkType"] },
          ],
          value: { ...row, linkType: "wiki" as LinkType },
        }));
      }
    };
  });
}

interface V3StoreSpec<TRow> {
  store: string;
  keyPath: string[];
  indexes: { name: string; keyPath: string | string[] }[];
  value: TRow;
}

/**
 * Read all rows from `storeName`, drop the store, recreate it with the wider
 * v3 key path and backfill-derived rows. Runs inside `onupgradeneeded`'s
 * version change transaction so the entire recreation is atomic.
 *
 * `storeName` の全行を読み出し、ストアを作り直して `mapRow` が返す新 keyPath と
 * インデックスで再生成する。version-change transaction 内で完結させることで、
 * 中途半端な状態が残らないようにする。
 */
function migrateLinkStoreToV3<TRow extends Record<string, unknown>>(
  db: IDBDatabase,
  tx: IDBTransaction,
  storeName: string,
  _oldKeyPath: string[],
  mapRow: (row: TRow) => V3StoreSpec<TRow>,
): void {
  if (!db.objectStoreNames.contains(storeName)) return;
  const oldStore = tx.objectStore(storeName);
  const getAllReq = oldStore.getAll();
  getAllReq.onsuccess = () => {
    const rows = (getAllReq.result as TRow[]) ?? [];
    const firstRow = rows[0];
    const spec = firstRow !== undefined ? mapRow(firstRow) : undefined;

    db.deleteObjectStore(storeName);
    const newStore = db.createObjectStore(
      storeName,
      spec
        ? { keyPath: spec.keyPath }
        : // Empty store: use hard-coded v3 shape keyed per `storeName`.
          // 行が 1 件も無い場合は mapRow を呼べないため、ストア名から v3 の
          // keyPath を決め打ちで作る。
          {
            keyPath:
              storeName === "my_links"
                ? ["sourceId", "targetId", "linkType"]
                : ["linkText", "sourcePageId", "linkType"],
          },
    );
    const indexSpecs: { name: string; keyPath: string | string[] }[] =
      spec?.indexes ??
      (storeName === "my_links"
        ? [
            { name: "by_source", keyPath: "sourceId" },
            { name: "by_target", keyPath: "targetId" },
            { name: "by_source_type", keyPath: ["sourceId", "linkType"] },
          ]
        : [
            { name: "by_source", keyPath: "sourcePageId" },
            { name: "by_source_type", keyPath: ["sourcePageId", "linkType"] },
          ]);
    for (const idx of indexSpecs) {
      newStore.createIndex(idx.name, idx.keyPath, { unique: false });
    }
    for (const row of rows) {
      const migrated = mapRow(row);
      newStore.put(migrated.value);
    }
  };
}

/** Load Y.Doc from y-indexeddb, return state, then destroy. Doc name must match CollaborationManager. */
function loadYDocState(pageId: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    const name = YDOC_NAME_PREFIX + pageId;
    const persistence = new IndexeddbPersistence(name, doc);
    let settled = false;
    const finish = (state: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      persistence.destroy();
      doc.destroy();
      resolve(state);
    };
    persistence.on("synced", () => {
      const state = Y.encodeStateAsUpdate(doc);
      finish(state.length > 0 ? state : null);
    });
    persistence.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        persistence.destroy();
        doc.destroy();
        reject(err);
      }
    });
    setTimeout(() => {
      const state = Y.encodeStateAsUpdate(doc);
      finish(state.length > 0 ? state : null);
    }, 100);
  });
}

/** Save state to y-indexeddb and set version in our store. */
async function saveYDocStateToIdb(
  pageId: string,
  state: Uint8Array,
  version: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const name = YDOC_NAME_PREFIX + pageId;
    const persistence = new IndexeddbPersistence(name, doc);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      persistence.destroy();
      doc.destroy();
      resolve();
    };
    persistence.on("synced", finish);
    persistence.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        persistence.destroy();
        doc.destroy();
        reject(err);
      }
    });
    setTimeout(finish, 200);
  });
  await setYDocVersion(pageId, version);
}

function getYDocVersionFromStore(pageId: string): Promise<number> {
  return ensureDb().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction("ydoc_versions", "readonly");
        const req = tx.objectStore("ydoc_versions").get(pageId);
        req.onsuccess = () => resolve((req.result?.version as number) ?? 1);
        req.onerror = () => resolve(1);
      }),
  );
}

function setYDocVersion(pageId: string, version: number): Promise<void> {
  return ensureDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("ydoc_versions", "readwrite");
        const req = tx.objectStore("ydoc_versions").put({ pageId, version });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
}

let adapterDb: IDBDatabase | null = null;
let adapterUserId: string | null = null;

/**
 * Thrown when {@link IndexedDBStorageAdapter.resetDatabase} cannot enumerate
 * the per-page Y.Doc databases before the main DB is deleted. Callers should
 * surface this distinctly so the user understands that no data was deleted
 * and they may retry safely.
 *
 * `resetDatabase` 実行時に Y.Doc DB 一覧の取得に失敗した場合に投げられる。
 * UI は専用メッセージで通知し、ユーザーが安全に再試行できるようにする。
 */
export class ResetDatabasePageIdsReadError extends Error {
  override readonly name = "ResetDatabasePageIdsReadError";
  /**
   * Underlying cause of the failure, normalized to an `Error` for diagnostics.
   * 失敗の原因となった元の例外。診断のため `Error` に正規化される。
   */
  readonly originalError: Error | undefined;
  /**
   * Construct the error with a normalized {@link originalError}.
   * `originalError` を正規化した形で保持する。
   * @param cause - The underlying error or value that prevented reading page IDs.
   *                Non-`Error` values (e.g. `DOMException` in some runtimes,
   *                strings) are wrapped in `new Error(String(cause))`.
   *                pageIds の読み取りを妨げた元のエラー / 値。
   *                `Error` でない場合は `new Error(String(cause))` でラップする。
   */
  constructor(cause: unknown) {
    super(
      "IndexedDBStorageAdapter.resetDatabase: failed to read page IDs; aborting reset to avoid orphaned Y.Doc databases.",
    );
    this.originalError =
      cause instanceof Error
        ? cause
        : cause === undefined || cause === null
          ? undefined
          : new Error(String(cause));
  }
}

/**
 * IndexedDB-backed implementation of {@link StorageAdapter} for the web platform.
 * Maintains one main DB per user (`zedi-storage-{userId}`) plus one Y.Doc DB
 * per page (`zedi-doc-{pageId}`) via `y-indexeddb`.
 *
 * Web 向けの IndexedDB ベース StorageAdapter 実装。ユーザーごとの主 DB と、
 * `y-indexeddb` がページごとに作成する Y.Doc DB を管理する。
 */
export class IndexedDBStorageAdapter implements StorageAdapter {
  /**
   * Open (or reopen for a new user) the user's main IndexedDB.
   * Must be called before any other method.
   *
   * 指定ユーザーの主 IndexedDB を開く（ユーザーが変わった場合は開き直す）。
   * 他のメソッドを呼び出す前に必ず実行する。
   */
  async initialize(userId: string): Promise<void> {
    if (adapterDb && adapterUserId === userId) return;
    if (adapterDb) {
      adapterDb.close();
      adapterDb = null;
      adapterUserId = null;
    }
    adapterDb = await openDb(userId);
    adapterUserId = userId;
  }

  /**
   * Close the main DB connection if open. Per-page Y.Doc DBs are not affected.
   * 主 DB が開いていれば閉じる。ページごとの Y.Doc DB には影響しない。
   */
  async close(): Promise<void> {
    if (adapterDb) {
      adapterDb.close();
      adapterDb = null;
      adapterUserId = null;
    }
  }

  /**
   * Delete the user's main DB and every per-page Y.Doc DB.
   *
   * If the page-IDs read fails the method aborts without touching any DB and
   * throws {@link ResetDatabasePageIdsReadError}, so the caller can retry
   * without leaving orphaned Y.Doc databases (#608).
   *
   * 主 DB と全ページの Y.Doc DB を削除する。
   * pageIds 取得に失敗した場合は何も削除せず {@link ResetDatabasePageIdsReadError}
   * を throw し、Y.Doc DB の孤児を残さず再試行できるようにする (#608)。
   */
  async resetDatabase(): Promise<void> {
    const userId = adapterUserId;
    if (!userId) throw new Error("IndexedDBStorageAdapter: not initialized.");

    // Collect page IDs first so we can delete per-page Y.Doc DBs after the main DB is gone.
    // 主 DB を消した後でもページごとの Y.Doc DB を削除できるよう、先に pageIds を取得する。
    let pageIds: string[];
    try {
      const db = await ensureDb();
      pageIds = await new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction("my_pages", "readonly");
        const req = tx.objectStore("my_pages").getAllKeys();
        req.onsuccess = () => resolve((req.result as string[]) || []);
        req.onerror = () => reject(req.error);
      });
    } catch (cause) {
      // Abort before any deletion — see #608.
      // 削除前に中断することで Y.Doc DB の孤児を防ぐ (#608)。
      throw new ResetDatabasePageIdsReadError(cause);
    }

    await this.close();

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME_PREFIX + userId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(
          new Error(
            "IndexedDBStorageAdapter: deleteDatabase for main DB is blocked (database is still open in another tab or context).",
          ),
        );
    });

    const results = await Promise.allSettled(
      pageIds.map(
        (pageId) =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(YDOC_NAME_PREFIX + pageId);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            req.onblocked = () =>
              reject(
                new Error(
                  `IndexedDBStorageAdapter: deleteDatabase for Y.Doc DB "${YDOC_NAME_PREFIX + pageId}" is blocked (database is still open in another tab or context).`,
                ),
              );
          }),
      ),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((f) => f.reason),
        `Failed to delete ${failures.length}/${pageIds.length} Y.Doc database(s)`,
      );
    }
  }

  // ── メタデータ / Page metadata ──

  /**
   * 削除されていない個人ページ（`noteId === null`）を `updatedAt` 降順で返す。
   * ノートネイティブページ（issue #713）はサーバー API 経由でのみ表示するため
   * IndexedDB には基本的に持ち込まれないが、混入時もここで除外する。
   *
   * Return all non-deleted personal pages (`noteId === null`), sorted by
   * `updatedAt` descending. Note-native pages (issue #713) are not expected
   * to land in IndexedDB but are filtered defensively if they do.
   *
   * NOTE: `by_note` index は `noteId = null` の行をインデックスから除外する
   * （IndexedDB 仕様: キー値が null の場合レコードは index に含まれない）。
   * そのため `index("by_note").getAll(IDBKeyRange.only(null))` は 0 件しか
   * 返せず、ここでは使えない。`by_note` index は将来ノートネイティブページを
   * 扱う実装（Phase 3 以降）で noteId 指定クエリ側に使う想定。
   *
   * NOTE: the `by_note` index excludes rows whose `noteId` is null (per the
   * IndexedDB spec, records are dropped from an index when the key value is
   * null). `index("by_note").getAll(IDBKeyRange.only(null))` therefore returns
   * zero rows and cannot replace this scan. The index is reserved for future
   * note-scoped queries once note-native pages are fetched into IDB.
   */
  async getAllPages(): Promise<PageMetadata[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_pages", "readonly");
      const req = tx.objectStore("my_pages").getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredPage[]) || [];
        const list = rows
          .filter((r) => !r.isDeleted && (r.noteId ?? null) === null)
          .map(storedToPage);
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Return a single page by id, or `null` when missing or soft-deleted.
   * 指定 id のページを返す。存在しないか論理削除済みなら `null`。
   */
  async getPage(pageId: string): Promise<PageMetadata | null> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_pages", "readonly");
      const req = tx.objectStore("my_pages").get(pageId);
      req.onsuccess = () => {
        const row = req.result as StoredPage | undefined;
        resolve(row && !row.isDeleted ? storedToPage(row) : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Insert or replace a page row keyed by `id`.
   * `id` をキーにページ行を upsert する。
   */
  async upsertPage(page: PageMetadata): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_pages", "readwrite");
      const req = tx.objectStore("my_pages").put(pageToStored(page));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Soft-delete the page (sets `isDeleted = true`); no-op if missing.
   * ページを論理削除する（存在しない場合は何もしない）。
   */
  async deletePage(pageId: string): Promise<void> {
    const page = await this.getPage(pageId);
    if (!page) return;
    await this.upsertPage({ ...page, isDeleted: true, updatedAt: Date.now() });
  }

  // ── Y.Doc ──

  /**
   * Load the Y.Doc binary state for a page, or `null` if empty / absent.
   * 指定ページの Y.Doc バイナリ状態を返す。空 / 未保存なら `null`。
   */
  async getYDocState(pageId: string): Promise<Uint8Array | null> {
    return loadYDocState(pageId);
  }

  /**
   * Persist the Y.Doc binary state and record its monotonic version.
   * Y.Doc バイナリ状態を保存し、単調増加のバージョンを記録する。
   */
  async saveYDocState(pageId: string, state: Uint8Array, version: number): Promise<void> {
    await saveYDocStateToIdb(pageId, state, version);
  }

  /**
   * Return the stored Y.Doc version for a page (defaults to 1).
   * 指定ページの Y.Doc バージョンを返す（既定は 1）。
   */
  async getYDocVersion(pageId: string): Promise<number> {
    return getYDocVersionFromStore(pageId);
  }

  // ── リンク / Links ──

  /**
   * Return forward links emanating from the given page.
   * When `linkType` is provided, scope to that type only (issue #725 Phase 1).
   *
   * 指定ページから出ているリンクを返す。`linkType` 指定時はその種別のみ返す。
   */
  async getLinks(pageId: string, linkType?: LinkType): Promise<Link[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readonly");
      const store = tx.objectStore("my_links");
      const index =
        linkType !== undefined ? store.index("by_source_type") : store.index("by_source");
      const req = linkType !== undefined ? index.getAll([pageId, linkType]) : index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredLink[]) || [];
        resolve(
          rows.map((r) => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            linkType: r.linkType,
            createdAt: r.createdAt,
          })),
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Return backlinks pointing at the given page.
   * 指定ページに入ってくる被リンク（バックリンク）を返す。`linkType` 指定で絞る。
   */
  async getBacklinks(pageId: string, linkType?: LinkType): Promise<Link[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readonly");
      const index = tx.objectStore("my_links").index("by_target");
      const req = index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredLink[]) || [];
        const filtered =
          linkType !== undefined ? rows.filter((r) => r.linkType === linkType) : rows;
        resolve(
          filtered.map((r) => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            linkType: r.linkType,
            createdAt: r.createdAt,
          })),
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Replace all forward links of a single `linkType` for a source page
   * (delete existing of that type, then insert). Rows of other link types are
   * left untouched so that e.g. tag sync cannot wipe wiki edges.
   *
   * 指定ソースページの forward links を `linkType` スコープで全置換する。
   * 他種別のエッジには触れない（issue #725 Phase 1）。
   */
  async saveLinks(sourcePageId: string, links: Link[], linkType: LinkType): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readwrite");
      const store = tx.objectStore("my_links");
      const index = store.index("by_source_type");
      const getAllReq = index.getAll([sourcePageId, linkType]);
      getAllReq.onsuccess = () => {
        const existing = getAllReq.result as StoredLink[];
        existing.forEach((r) => store.delete([r.sourceId, r.targetId, r.linkType]));
        const now = Date.now();
        links.forEach((l) => {
          store.put({
            sourceId: l.sourceId,
            targetId: l.targetId,
            linkType,
            createdAt: l.createdAt ?? now,
          });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  }

  /**
   * Return ghost links (unresolved wiki link / tag targets) for a source page.
   * 指定ソースページの ghost link を返す。`linkType` 指定で種別ごとに絞る。
   */
  async getGhostLinks(pageId: string, linkType?: LinkType): Promise<GhostLink[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_ghost_links", "readonly");
      const store = tx.objectStore("my_ghost_links");
      const index =
        linkType !== undefined ? store.index("by_source_type") : store.index("by_source");
      const req = linkType !== undefined ? index.getAll([pageId, linkType]) : index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredGhostLink[]) || [];
        resolve(
          rows.map((r) => ({
            linkText: r.linkText,
            sourcePageId: r.sourcePageId,
            linkType: r.linkType,
            createdAt: r.createdAt,
            originalTargetPageId: r.originalTargetPageId ?? null,
            originalNoteId: r.originalNoteId ?? null,
          })),
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Replace all ghost links of a single `linkType` for a source page. Rows of
   * other link types are preserved so tag-ghost and wiki-ghost can coexist.
   *
   * 指定ソースページの ghost link を `linkType` スコープで全置換する。他種別の
   * ゴーストは残る（issue #725 Phase 1）。
   */
  async saveGhostLinks(
    sourcePageId: string,
    ghostLinks: GhostLink[],
    linkType: LinkType,
  ): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_ghost_links", "readwrite");
      const store = tx.objectStore("my_ghost_links");
      const index = store.index("by_source_type");
      const getAllReq = index.getAll([sourcePageId, linkType]);
      getAllReq.onsuccess = () => {
        const existing = getAllReq.result as StoredGhostLink[];
        existing.forEach((r) => store.delete([r.linkText, r.sourcePageId, r.linkType]));
        const now = Date.now();
        ghostLinks.forEach((g) => {
          store.put({
            linkText: g.linkText,
            sourcePageId: g.sourcePageId,
            linkType,
            createdAt: g.createdAt ?? now,
            originalTargetPageId: g.originalTargetPageId ?? null,
            originalNoteId: g.originalNoteId ?? null,
          });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  }

  // ── 検索 / Search ──

  /**
   * Substring search over the local search index. Returns up to one result per
   * matching page with a 200-char snippet.
   * ローカル検索インデックスに対する部分一致検索。1 ページにつき最大 1 件、
   * 200 文字までのスニペットを返す。
   */
  async searchPages(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["search_index", "my_pages"], "readonly");
      const searchStore = tx.objectStore("search_index");
      const pagesStore = tx.objectStore("my_pages");
      const req = searchStore.getAll();
      req.onsuccess = () => {
        const entries = (req.result as Array<{ pageId: string; text: string }>) || [];
        const matching = entries.filter((e) => e.text && e.text.toLowerCase().includes(q));
        if (matching.length === 0) {
          resolve([]);
          return;
        }
        const results: SearchResult[] = new Array(matching.length);
        let done = 0;
        matching.forEach((entry, i) => {
          const r = pagesStore.get(entry.pageId);
          r.onsuccess = () => {
            results[i] = {
              pageId: entry.pageId,
              title: (r.result as StoredPage)?.title ?? null,
              snippet: entry.text.slice(0, 200),
            };
            done++;
            if (done === matching.length) resolve(results);
          };
          r.onerror = () => {
            results[i] = { pageId: entry.pageId, title: null, snippet: entry.text.slice(0, 200) };
            done++;
            if (done === matching.length) resolve(results);
          };
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Upsert the search-index entry (`pageId` → `text`) used by `searchPages`.
   * `searchPages` が参照する検索インデックス (`pageId` → `text`) を upsert する。
   */
  async updateSearchIndex(pageId: string, text: string): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("search_index", "readwrite");
      const req = tx.objectStore("search_index").put({ pageId, text: text || "" });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ── 同期メタデータ / Sync metadata ──

  /**
   * Return the persisted `lastSyncTime` epoch ms (0 if never synced).
   * 永続化された `lastSyncTime` を epoch ms で返す（未同期なら 0）。
   */
  async getLastSyncTime(): Promise<number> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get("lastSyncTime");
      req.onsuccess = () => resolve((req.result as MetaRow | undefined)?.value ?? 0);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persist the `lastSyncTime` epoch ms used by the sync engine.
   * 同期エンジンが利用する `lastSyncTime` (epoch ms) を保存する。
   */
  async setLastSyncTime(time: number): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      const req = tx.objectStore("meta").put({ key: "lastSyncTime", value: time });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
