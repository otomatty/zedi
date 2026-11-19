/** Role of a user within a note. */
export type NoteRole = "owner" | "editor" | "viewer";

/**
 * Page row returned by the list and search APIs.
 * 一覧・検索 API が返すページ行。
 */
export interface PageListItem {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
}

/** `GET /api/notes/:noteId/pages` (keyset paginated). */
export interface PageListResponse {
  items: PageListItem[];
  nextCursor: string | null;
  total: number;
  role: NoteRole;
}

/** `GET /api/pages/:id`: a page plus the caller's role in its note. */
export interface PageDetail extends PageListItem {
  noteId: string;
  role: NoteRole;
}

/** `GET /api/search`. */
export interface SearchResponse {
  items: PageListItem[];
}
