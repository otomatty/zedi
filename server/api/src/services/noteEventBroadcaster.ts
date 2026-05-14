/**
 * ノート単位のページ変更イベントを SSE 購読者へ配送する in-memory pub/sub
 * (Issue #860 Phase 4)。`GET /api/notes/:noteId/events` で接続したクライアントは
 * 該当ノートに関する `page.added` / `page.updated` / `page.deleted` /
 * `note.permission_changed` だけを受け取る。
 *
 * In-memory pub/sub used by the note-scoped SSE feed
 * (`GET /api/notes/:noteId/events`, issue #860 Phase 4). Listeners are
 * partitioned by `note_id`, so page mutations on note A never leak to clients
 * watching note B. Producers (POST/DELETE under `routes/notes/pages.ts` and
 * `routes/pages.ts`, member / note metadata mutations) call
 * `publishNoteEvent` after the underlying DB transaction commits.
 *
 * `apiErrorBroadcaster` と同じく単一プロセス前提。横展開時は Redis Pub/Sub /
 * Postgres LISTEN/NOTIFY に差し替える前提で、呼び出し側は `publish` /
 * `subscribe` の関数シグネチャだけに依存している。
 *
 * Single-process only — mirrors the `apiErrorBroadcaster` pattern. When the
 * API scales horizontally, swap the implementation for Redis Pub/Sub or
 * Postgres LISTEN/NOTIFY without touching the call sites; the contract here is
 * intentionally `publish(event)` / `subscribe(noteId, listener) -> unsubscribe`.
 *
 * @see ./apiErrorBroadcaster.ts
 * @see ../routes/notes/events.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import type { NotePageWindowItem } from "../routes/notes/types.js";

/**
 * `subscribeNoteEvents` の同時接続数上限（全ノート合算）。1 ノートに対する
 * 偏りもまとめて防御する目的で、合計値で上限を設ける。
 *
 * Hard cap on simultaneous SSE subscribers across all notes. The cap is on
 * the total subscriber set so a single hot note cannot starve the rest by
 * filling the pool, while still keeping memory and file descriptors bounded.
 */
export const NOTE_EVENT_STREAM_MAX_SUBSCRIBERS = 256;

/**
 * `page.added` / `page.updated` のペイロード本体。`GET /api/notes/:noteId/pages`
 * の {@link NotePageWindowItem} と同形にしておくことで、フロント側の React
 * Query infinite cache に `setQueriesData` で直接挿入できる。
 *
 * Payload of `page.added` / `page.updated`. The shape mirrors
 * `NotePageWindowItem` from the windowed list endpoint so the client can
 * splice the event directly into its `useInfiniteNotePages` cache via
 * `setQueriesData` without a re-fetch.
 */
export type NoteEventPageSnapshot = NotePageWindowItem;

/**
 * SSE で配送するノートイベントの discriminated union (Issue #860 Phase 4)。
 *
 * - `page.added`              : 新規ページが note に作成された
 * - `page.updated`            : 既存ページのタイトル / preview / thumbnail が変わった
 * - `page.deleted`            : ページが soft-delete された
 * - `note.permission_changed` : note の visibility / edit_permission /
 *                               member / domain rule など、`getNoteRole` の
 *                               解釈に影響する変更があった。クライアントは
 *                               window / details / members を invalidate する。
 *
 * Discriminated union of note-scoped SSE events delivered to the
 * `/api/notes/:noteId/events` endpoint. `page.added` / `page.updated` carry
 * the full window-shape page snapshot; `page.deleted` carries only the page
 * id; `note.permission_changed` is a sentinel that signals subscribers to
 * invalidate the note's window / details / members caches.
 */
export type NoteEvent =
  | { type: "page.added"; note_id: string; page: NoteEventPageSnapshot }
  | { type: "page.updated"; note_id: string; page: NoteEventPageSnapshot }
  | { type: "page.deleted"; note_id: string; page_id: string }
  | { type: "note.permission_changed"; note_id: string };

/**
 * `subscribeNoteEvents` のリスナー型。同期コールバック。SSE ルートは
 * Promise チェーンで非同期に直列化して書き出す。
 *
 * Synchronous listener signature. The SSE route serializes writes through a
 * Promise chain so callbacks must not be async themselves.
 */
export type NoteEventListener = (event: NoteEvent) => void;

const listenersByNote = new Map<string, Set<NoteEventListener>>();
let totalSubscribers = 0;

/**
 * `subscribeNoteEvents` が上限に達した時に投げる例外。SSE ルートは 503 に
 * マップして backoff を促す。
 *
 * Thrown by `subscribeNoteEvents` when the subscriber cap is reached. The
 * SSE route surfaces it as a 503 so clients back off and retry.
 */
export class NoteEventStreamCapacityExceededError extends Error {
  constructor() {
    super(`note_event stream subscriber cap reached (${NOTE_EVENT_STREAM_MAX_SUBSCRIBERS})`);
    this.name = "NoteEventStreamCapacityExceededError";
  }
}

/**
 * 指定ノートのイベント購読者を登録する。返り値の `unsubscribe` を必ず
 * `stream.onAbort` などから呼んでメモリリークを防ぐ。
 *
 * Register a listener for events on `noteId`. Always call the returned
 * `unsubscribe` from the SSE handler's abort path so the listener set does
 * not grow unbounded when clients reconnect.
 */
export function subscribeNoteEvents(noteId: string, listener: NoteEventListener): () => void {
  if (totalSubscribers >= NOTE_EVENT_STREAM_MAX_SUBSCRIBERS) {
    throw new NoteEventStreamCapacityExceededError();
  }
  let bucket = listenersByNote.get(noteId);
  if (!bucket) {
    bucket = new Set();
    listenersByNote.set(noteId, bucket);
  }
  // `Set.add` は冪等なので、同じ listener が二重 subscribe された場合に
  // bucket.size は増えない。`totalSubscribers` の増減を `bucket.size` の差で
  // 駆動することで、unsubscribe との計数が必ず対称になる
  // (coderabbitai review on PR #867 major)。
  // `Set.add` is idempotent — a double-subscribe of the same function reference
  // does not enlarge the set. Drive the accounting off the size delta so the
  // add/remove sides stay symmetric and bogus capacity rejections cannot drift
  // in (coderabbitai review on PR #867 major).
  const beforeSize = bucket.size;
  bucket.add(listener);
  const added = bucket.size > beforeSize;
  if (added) totalSubscribers += 1;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (!added) return;
    const current = listenersByNote.get(noteId);
    if (!current) return;
    if (!current.delete(listener)) return;
    totalSubscribers -= 1;
    if (current.size === 0) {
      listenersByNote.delete(noteId);
    }
  };
}

/**
 * `event.note_id` の購読者全員へイベントを配送する。リスナーが throw しても
 * 他の購読者には影響しない（個別 try/catch でログだけ残す）。
 *
 * Fan out `event` to every subscriber of `event.note_id`. A listener that
 * throws is logged and skipped, mirroring `apiErrorBroadcaster` semantics so
 * one buggy connection cannot break broadcast for the rest.
 */
export function publishNoteEvent(event: NoteEvent): void {
  const bucket = listenersByNote.get(event.note_id);
  if (!bucket || bucket.size === 0) return;
  // イベント配信中に listener が unsubscribe / subscribe しても安全なように
  // スナップショットしてから反復する。
  // Snapshot the listener set before iteration so a listener that
  // un/subscribes during dispatch does not perturb the in-progress fan-out.
  const snapshot = Array.from(bucket);
  for (const listener of snapshot) {
    try {
      listener(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[note-event-broadcaster] subscriber threw: ${message}`);
    }
  }
}

/**
 * 購読者数を取得する。`noteId` を渡すとそのノートの購読者数、未指定なら全体数。
 *
 * Subscriber count. Pass a `noteId` for the per-note total, omit it for the
 * aggregate. Used by the SSE route for capacity checks and by tests.
 */
export function noteEventSubscriberCount(noteId?: string): number {
  if (noteId === undefined) return totalSubscribers;
  return listenersByNote.get(noteId)?.size ?? 0;
}

/**
 * 全購読者を強制解除する。テスト用ヘルパ。
 * Drop every subscriber. Test-only helper.
 */
export function clearNoteEventSubscribers(): void {
  listenersByNote.clear();
  totalSubscribers = 0;
}
