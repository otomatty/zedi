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
   * 所属ノート ID。`null` は個人ページ、文字列値はそのノートに所属する
   * ノートネイティブページ。Web の IndexedDB は個人ページのみを保持する
   * 想定だが、将来の混在に備えてフィールドだけは持たせている。Issue #713 を参照。
   *
   * Owning note ID. `null` is a personal page; a string identifies a
   * note-native page. The web IndexedDB is expected to hold only personal
   * pages, but the field is carried for forward compatibility. See issue #713.
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
