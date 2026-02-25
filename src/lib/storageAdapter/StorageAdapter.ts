/**
 * StorageAdapter interface (§6.1 zedi-rearchitecture-spec.md).
 * Platform abstraction for metadata, Y.Doc, links, search, and sync timestamp.
 * Web: IndexedDBStorageAdapter. Tauri: TauriStorageAdapter (Phase D).
 */

import type { PageMetadata, Link, GhostLink, SearchResult } from "./types";

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

  // ── リンク ──
  getLinks(pageId: string): Promise<Link[]>;
  getBacklinks(pageId: string): Promise<Link[]>;
  saveLinks(sourcePageId: string, links: Link[]): Promise<void>;
  getGhostLinks(pageId: string): Promise<GhostLink[]>;
  saveGhostLinks(sourcePageId: string, ghostLinks: GhostLink[]): Promise<void>;

  // ── 検索 ──
  searchPages(query: string): Promise<SearchResult[]>;
  updateSearchIndex(pageId: string, text: string): Promise<void>;

  // ── 同期メタデータ ──
  getLastSyncTime(): Promise<number>;
  setLastSyncTime(time: number): Promise<void>;

  // ── 初期化・クリーンアップ ──
  initialize(userId: string): Promise<void>;
  close(): Promise<void>;
}
