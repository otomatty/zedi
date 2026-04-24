/**
 * StorageAdapter interface (§6.1 zedi-rearchitecture-spec.md).
 * Platform abstraction for metadata, Y.Doc, links, search, and sync timestamp.
 * Web: IndexedDBStorageAdapter. Tauri: TauriStorageAdapter (Phase D).
 */

import type { PageMetadata, Link, GhostLink, LinkType, SearchResult } from "./types";

/**
 * ストレージアダプタインターフェース (§6.1 zedi-rearchitecture-spec.md)。
 * メタデータ、Y.Doc、リンク、検索、同期タイムスタンプのプラットフォーム抽象化。
 * Web は `IndexedDBStorageAdapter`、Tauri は `TauriStorageAdapter` (Phase D)。
 *
 * Platform abstraction for metadata, Y.Doc, links, search, and sync timestamp
 * (§6.1 zedi-rearchitecture-spec.md). Web is backed by `IndexedDBStorageAdapter`;
 * Tauri will use `TauriStorageAdapter` (Phase D).
 */
export interface StorageAdapter {
  // ── メタデータ ──
  getAllPages(): Promise<PageMetadata[]>;
  getPage(pageId: string): Promise<PageMetadata | null>;
  upsertPage(page: PageMetadata): Promise<void>;
  deletePage(pageId: string): Promise<void>;

  // ── Y.Doc ──
  getYDocState(pageId: string): Promise<Uint8Array | null>;
  saveYDocState(pageId: string, state: Uint8Array, version: number): Promise<void>;
  getYDocVersion(pageId: string): Promise<number>;

  // ── リンク / Links ──
  //
  // `linkType` 省略時は全種別 (`'wiki'` + `'tag'`) を対象にする。Issue #725 Phase 1
  // で `link_type` を導入して以降、書き込み系 (`saveLinks` / `saveGhostLinks`) は
  // `linkType` を明示して「その種別のみを全置換」させる契約。未指定だった既存
  // 呼び出し元は段階的に移行する。
  //
  // When `linkType` is omitted, read methods return rows of any type. Write
  // methods require an explicit `linkType` (issue #725) and replace only that
  // type's rows for the given source — they never wipe edges of other types.
  getLinks(pageId: string, linkType?: LinkType): Promise<Link[]>;
  getBacklinks(pageId: string, linkType?: LinkType): Promise<Link[]>;
  saveLinks(sourcePageId: string, links: Link[], linkType: LinkType): Promise<void>;
  getGhostLinks(pageId: string, linkType?: LinkType): Promise<GhostLink[]>;
  saveGhostLinks(sourcePageId: string, ghostLinks: GhostLink[], linkType: LinkType): Promise<void>;

  // ── 検索 ──
  searchPages(query: string): Promise<SearchResult[]>;
  updateSearchIndex(pageId: string, text: string): Promise<void>;

  // ── 同期メタデータ ──
  getLastSyncTime(): Promise<number>;
  setLastSyncTime(time: number): Promise<void>;

  // ── 初期化・クリーンアップ ──
  initialize(userId: string): Promise<void>;
  close(): Promise<void>;

  /**
   * Delete all local data (IndexedDB) for the current user and reset sync state.
   * After calling this, initialize() must be called again before any other operation.
   */
  resetDatabase(): Promise<void>;
}
