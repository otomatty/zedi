/**
 * IndexedDB-backed StorageAdapter for Web (§6.2 zedi-rearchitecture-spec.md).
 * C3-2: my_pages, y-indexeddb (zedi-doc-{pageId}), my_links, my_ghost_links, search_index, meta.
 */

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { StorageAdapter } from "./StorageAdapter";
import type { PageMetadata, Link, GhostLink, SearchResult } from "./types";

const DB_NAME_PREFIX = "zedi-storage-";
const DB_VERSION = 1;
const YDOC_NAME_PREFIX = "zedi-doc-";

/** Stored page row (camelCase for consistency with PageMetadata). */
interface StoredPage {
  id: string;
  ownerId: string;
  sourcePageId: string | null;
  title: string | null;
  contentPreview: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/** Stored link row. */
interface StoredLink {
  sourceId: string;
  targetId: string;
  createdAt: number;
}

/** Stored ghost link row. */
interface StoredGhostLink {
  linkText: string;
  sourcePageId: string;
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
  return { ...s };
}

function ensureDb(): Promise<IDBDatabase> {
  if (!adapterDb) throw new Error("IndexedDBStorageAdapter: not initialized. Call initialize(userId) first.");
  return Promise.resolve(adapterDb);
}

function getStore(mode: IDBTransactionMode, name: string): Promise<IDBObjectStore> {
  return ensureDb().then((db) => {
    const tx = db.transaction(name, mode);
    return tx.objectStore(name);
  });
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME_PREFIX + userId, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("my_pages")) {
        const pages = db.createObjectStore("my_pages", { keyPath: "id" });
        pages.createIndex("updated_at", "updatedAt", { unique: false });
        pages.createIndex("created_at", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("my_links")) {
        const links = db.createObjectStore("my_links", { keyPath: ["sourceId", "targetId"] });
        links.createIndex("by_source", "sourceId", { unique: false });
        links.createIndex("by_target", "targetId", { unique: false });
      }
      if (!db.objectStoreNames.contains("my_ghost_links")) {
        const ghost = db.createObjectStore("my_ghost_links", { keyPath: ["linkText", "sourcePageId"] });
        ghost.createIndex("by_source", "sourcePageId", { unique: false });
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
    };
  });
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
async function saveYDocStateToIdb(pageId: string, state: Uint8Array, version: number): Promise<void> {
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
      })
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
      })
  );
}

let adapterDb: IDBDatabase | null = null;
let adapterUserId: string | null = null;

export class IndexedDBStorageAdapter implements StorageAdapter {
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

  async close(): Promise<void> {
    if (adapterDb) {
      adapterDb.close();
      adapterDb = null;
      adapterUserId = null;
    }
  }

  // ── メタデータ ──
  async getAllPages(): Promise<PageMetadata[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_pages", "readonly");
      const req = tx.objectStore("my_pages").getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredPage[]) || [];
        const list = rows.filter((r) => !r.isDeleted).map(storedToPage);
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

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

  async upsertPage(page: PageMetadata): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_pages", "readwrite");
      const req = tx.objectStore("my_pages").put(pageToStored(page));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deletePage(pageId: string): Promise<void> {
    const page = await this.getPage(pageId);
    if (!page) return;
    await this.upsertPage({ ...page, isDeleted: true, updatedAt: Date.now() });
  }

  // ── Y.Doc ──
  async getYDocState(pageId: string): Promise<Uint8Array | null> {
    return loadYDocState(pageId);
  }

  async saveYDocState(pageId: string, state: Uint8Array, version: number): Promise<void> {
    await saveYDocStateToIdb(pageId, state, version);
  }

  async getYDocVersion(pageId: string): Promise<number> {
    return getYDocVersionFromStore(pageId);
  }

  // ── リンク ──
  async getLinks(pageId: string): Promise<Link[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readonly");
      const index = tx.objectStore("my_links").index("by_source");
      const req = index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredLink[]) || [];
        resolve(rows.map((r) => ({ sourceId: r.sourceId, targetId: r.targetId, createdAt: r.createdAt })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getBacklinks(pageId: string): Promise<Link[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readonly");
      const index = tx.objectStore("my_links").index("by_target");
      const req = index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredLink[]) || [];
        resolve(rows.map((r) => ({ sourceId: r.sourceId, targetId: r.targetId, createdAt: r.createdAt })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveLinks(sourcePageId: string, links: Link[]): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_links", "readwrite");
      const store = tx.objectStore("my_links");
      const index = store.index("by_source");
      const getAllReq = index.getAll(sourcePageId);
      getAllReq.onsuccess = () => {
        const existing = getAllReq.result as StoredLink[];
        existing.forEach((r) => store.delete([r.sourceId, r.targetId]));
        const now = Date.now();
        links.forEach((l) => {
          store.put({
            sourceId: l.sourceId,
            targetId: l.targetId,
            createdAt: l.createdAt ?? now,
          });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  }

  async getGhostLinks(pageId: string): Promise<GhostLink[]> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_ghost_links", "readonly");
      const index = tx.objectStore("my_ghost_links").index("by_source");
      const req = index.getAll(pageId);
      req.onsuccess = () => {
        const rows = (req.result as StoredGhostLink[]) || [];
        resolve(
          rows.map((r) => ({
            linkText: r.linkText,
            sourcePageId: r.sourcePageId,
            createdAt: r.createdAt,
            originalTargetPageId: r.originalTargetPageId ?? null,
            originalNoteId: r.originalNoteId ?? null,
          }))
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveGhostLinks(sourcePageId: string, ghostLinks: GhostLink[]): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("my_ghost_links", "readwrite");
      const store = tx.objectStore("my_ghost_links");
      const index = store.index("by_source");
      const getAllReq = index.getAll(sourcePageId);
      getAllReq.onsuccess = () => {
        const existing = getAllReq.result as StoredGhostLink[];
        existing.forEach((r) => store.delete([r.linkText, r.sourcePageId]));
        const now = Date.now();
        ghostLinks.forEach((g) => {
          store.put({
            linkText: g.linkText,
            sourcePageId: g.sourcePageId,
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

  // ── 検索 ──
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

  async updateSearchIndex(pageId: string, text: string): Promise<void> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("search_index", "readwrite");
      const req = tx.objectStore("search_index").put({ pageId, text: text || "" });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ── 同期メタデータ ──
  async getLastSyncTime(): Promise<number> {
    const db = await ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get("lastSyncTime");
      req.onsuccess = () => resolve((req.result as MetaRow | undefined)?.value ?? 0);
      req.onerror = () => reject(req.error);
    });
  }

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
