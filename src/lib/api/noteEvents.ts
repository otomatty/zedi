/**
 * `/api/notes/:noteId/events` SSE フィードの wire 型 (Issue #860 Phase 4)。
 *
 * サーバ側 `server/api/src/services/noteEventBroadcaster.ts` の `NoteEvent`
 * union と同じ shape を、フロント側で独立に宣言する（既存方針: server コードを
 * 直接 import しない）。サーバが送る `event:` フィールドが各イベント名
 * (`page.added` / `page.updated` / `page.deleted` / `note.permission_changed`)
 * になるため、union の `type` 値もそれに揃える。`page.added` / `page.updated`
 * の `page` payload は `NotePageWindowItem` と同形で、preview / thumbnail を
 * 常に含む（SSE 経路は include 選択をサポートしない）。
 *
 * Wire types for the `/api/notes/:noteId/events` SSE feed (Issue #860 Phase 4).
 * Declared independently from `server/api/src/services/noteEventBroadcaster.ts`
 * to keep the frontend free of server-side imports, but the discriminator
 * (`type`) and field names match exactly so the SSE bytes can be cast
 * directly into a {@link NoteEvent}. The `page` payload mirrors
 * {@link NotePageWindowItem} and always carries `content_preview` /
 * `thumbnail_url` (the SSE channel does not support `?include=`).
 *
 * @see ../../hooks/useNotePageEvents.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import type { NotePageWindowItem } from "./types";

/**
 * SSE で受信するノートイベント名定数。`EventSource.addEventListener(name, ...)`
 * に渡す。`ready` は接続確立直後のハロー、それ以外はサーバ側の DB ミューテーション
 * 後に publish される。
 *
 * Constant tuple of SSE event names. Used as the `event` field both on the
 * wire and as argument to `EventSource.addEventListener`. `ready` is the
 * hello that the server emits on connect; the other four are produced by the
 * page / member / note metadata mutation handlers.
 */
export const NOTE_EVENT_NAMES = [
  "ready",
  "page.added",
  "page.updated",
  "page.deleted",
  "note.permission_changed",
] as const;

/** Union of valid SSE event names for this feed. */
export type NoteEventName = (typeof NOTE_EVENT_NAMES)[number];

/**
 * `ready` イベントの payload。接続が確立して購読が始まったことを示すだけの
 * ハロー。フロント側は invalidate トリガとして使う（再接続のラウンドで
 * 切断中の取りこぼしを補修するため）。
 *
 * `ready` event payload. The server sends it immediately after subscribing
 * the client; the frontend uses it as the trigger to invalidate the pages
 * window cache once, covering anything that mutated while the connection
 * was being established or after a reconnect.
 */
export interface NoteReadyEventData {
  note_id: string;
}

/**
 * `page.added` / `page.updated` の payload。`page` は `NotePageWindowItem` と
 * 同形なので `useInfiniteNotePages` のキャッシュへ直接挿入できる。
 *
 * Payload for `page.added` / `page.updated`. The `page` slot is a
 * `NotePageWindowItem` so it can be spliced directly into the
 * `useInfiniteNotePages` React Query cache.
 */
export interface NotePageEventData {
  note_id: string;
  page: NotePageWindowItem;
}

/**
 * `page.deleted` の payload。サーバは消したページ id だけを通知し、
 * クライアントは window の items 配列からその id をフィルタする。
 *
 * Payload for `page.deleted`. The server only sends the deleted page id;
 * the client removes it from every cached window for that note.
 */
export interface NotePageDeletedEventData {
  note_id: string;
  page_id: string;
}

/**
 * `note.permission_changed` の payload。ノートの visibility / edit_permission /
 * member / domain rule のいずれかが変わったことを示すセンチネル。クライアントは
 * details / window / members を invalidate する。
 *
 * Payload for `note.permission_changed`. Sentinel that signals one of
 * visibility / edit_permission / member / domain rule changed. The client
 * invalidates the note's details, pages window, and members cache so the
 * next render re-evaluates access.
 */
export interface NotePermissionChangedEventData {
  note_id: string;
}

/**
 * SSE feed が配信するイベントの discriminated union。サーバ側の `NoteEvent`
 * （`server/api/src/services/noteEventBroadcaster.ts`）と shape が一致する。
 *
 * Discriminated union of events sent over the SSE feed. Matches the
 * server-side `NoteEvent` in `noteEventBroadcaster.ts` slot-for-slot.
 */
export type NoteEvent =
  | { type: "page.added"; note_id: string; page: NotePageWindowItem }
  | { type: "page.updated"; note_id: string; page: NotePageWindowItem }
  | { type: "page.deleted"; note_id: string; page_id: string }
  | { type: "note.permission_changed"; note_id: string };
