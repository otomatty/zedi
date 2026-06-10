/**
 * Types for StorageAdapter (platform abstraction layer).
 * Aligned with Aurora schema and §6.1 of zedi-rearchitecture-spec.md.
 * IDs are UUID. Timestamps are number (ms) for consistency with frontend.
 */

/** Page metadata only (no content). Stored in my_pages / pages. */
export interface PageMetadata {
  id: string;
  ownerId: string;
  /**
   * 所属ノート ID。すべてのページはちょうど 1 つのノートに属する（Issue #823 /
   * #1020）。Web の IndexedDB が保持するのは呼び出し元のデフォルトノート配下の
   * ページのみ。旧「個人ページ」（`null`）は廃止済みで、レガシー行は同期時に
   * デフォルトノートへ付け替えられる。
   *
   * Owning note ID. Every page belongs to exactly one note (issues #823 /
   * #1020); the web IndexedDB only holds pages under the caller's default
   * note. The legacy "personal page" (`null`) model is retired — leftover
   * rows are reassigned to the default note during sync.
   */
  noteId: string;
  sourcePageId: string | null;
  title: string | null;
  contentPreview: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

/**
 * `links` / `ghost_links` の種別識別子。サーバ側 `link_type` カラムに対応。
 * `'wiki'` は既存 WikiLink、`'tag'` は issue #725 で追加されたタグ記法。
 *
 * Discriminator shared by `links` / `ghost_links`; mirrors server `link_type`.
 */
export type LinkType = "wiki" | "tag";

/** Link between two pages (source → target). `linkType` distinguishes wiki vs. tag edges. */
export interface Link {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  createdAt: number;
}

/**
 * Ghost link (unresolved wiki link or tag). C2-6: optional original_target_page_id /
 * original_note_id. `linkType` distinguishes WikiLink vs. tag (issue #725 Phase 1).
 */
export interface GhostLink {
  linkText: string;
  sourcePageId: string;
  linkType: LinkType;
  createdAt: number;
  originalTargetPageId?: string | null;
  originalNoteId?: string | null;
}

/** Result item from searchPages(query). */
export interface SearchResult {
  pageId: string;
  title: string | null;
  /** Snippet or preview of matching text (optional). */
  snippet?: string;
}
