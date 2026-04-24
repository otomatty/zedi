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

/** Link between two pages (source → target). */
export interface Link {
  sourceId: string;
  targetId: string;
  createdAt: number;
}

/** Ghost link (unresolved wiki link). C2-6: optional original_target_page_id / original_note_id. */
export interface GhostLink {
  linkText: string;
  sourcePageId: string;
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
