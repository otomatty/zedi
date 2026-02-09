/**
 * Types for StorageAdapter (platform abstraction layer).
 * Aligned with Aurora schema and §6.1 of zedi-rearchitecture-spec.md.
 * IDs are UUID. Timestamps are number (ms) for consistency with frontend.
 */

/** Page metadata only (no content). Stored in my_pages / pages. */
export interface PageMetadata {
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
