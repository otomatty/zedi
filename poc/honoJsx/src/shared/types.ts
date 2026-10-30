/**
 * Summary of a note page, as returned by `GET /api/notes`.
 * `GET /api/notes` が返すページ概要。
 */
export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  updatedAt: string;
}

/**
 * Paged response of `GET /api/notes`.
 * `GET /api/notes` のページング付きレスポンス。
 */
export interface NoteListResponse {
  items: NoteSummary[];
  total: number;
}
