/**
 * ノートイベント emit 用のページ snapshot 整形ヘルパ (Issue #860 Phase 4)。
 *
 * `publishNoteEvent` の `page.added` / `page.updated` ペイロードは
 * `GET /api/notes/:noteId/pages` の {@link NotePageWindowItem} と同形にしておく
 * ことで、フロント側の React Query infinite cache に `setQueriesData` で
 * そのまま流し込める。drizzle の `.returning()` が返す camelCase 行を
 * snake_case の wire 形式に揃える橋渡しがこのモジュールの責務。
 *
 * Shapes a `pages` row (camelCase, as returned by drizzle `.returning()`)
 * into the snake_case `NotePageWindowItem` consumed by the SSE channel and
 * the windowed list endpoint (Issue #860 Phase 4). Keeping a single helper
 * avoids drift between the publish path and the GET path.
 *
 * @see ../../services/noteEventBroadcaster.ts
 * @see ./pages.ts
 * @see ../pages.ts (`/api/pages` mirror routes)
 */
import type { Page } from "../../schema/index.js";
import type { NotePageWindowItem } from "./types.js";

/**
 * `pages` row（camelCase / drizzle 戻り値）を {@link NotePageWindowItem} に
 * 変換する。SSE 経由のクライアントは `?include=preview,thumbnail` 相当の
 * 全フィールドを期待するため、`content_preview` / `thumbnail_url` を
 * そのまま積む。一覧 GET と異なり、ここで null マスクはしない。
 *
 * Convert a `pages` row to the SSE wire snapshot. Unlike the windowed list
 * which masks `content_preview` / `thumbnail_url` to `null` without an
 * `?include=` token, the SSE feed always carries both because the
 * `useInfiniteNotePages` default request set is `preview,thumbnail`.
 */
export function pageRowToWindowItem(row: Page): NotePageWindowItem {
  return {
    id: row.id,
    owner_id: row.ownerId,
    note_id: row.noteId,
    source_page_id: row.sourcePageId ?? null,
    title: row.title ?? null,
    content_preview: row.contentPreview ?? null,
    thumbnail_url: row.thumbnailUrl ?? null,
    source_url: row.sourceUrl ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    is_deleted: row.isDeleted,
  };
}
