/**
 * GET /api/notes/:noteId/events — ノート単位のページ変更イベントを SSE で配信する
 * (Issue #860 Phase 4)。`authOptional` + {@link getNoteRole} の組み合わせにより、
 * 公開 / unlisted ノートでは未ログインの guest でもイベントを購読できる。
 *
 * SSE feed for note-scoped page mutation events (Issue #860 Phase 4). The
 * client subscribes via `EventSource('/api/notes/:noteId/events')` and applies
 * each event to its `useInfiniteNotePages` React Query cache, avoiding a full
 * window refetch on every mutation. Auth is `authOptional` so guests of
 * public / unlisted notes can watch the feed; private / restricted notes still
 * reject unknown callers with 403.
 *
 * イベント仕様 / Wire events:
 *   - `ready`                   : 接続確立直後の hello。`retry: 30000` 付き。
 *   - `page.added`              : `data` は {@link NoteEvent} JSON。
 *   - `page.updated`            : 同上。
 *   - `page.deleted`            : 同上 (`{ note_id, page_id }`)。
 *   - `note.permission_changed` : 同上 (`{ note_id }` のみのセンチネル)。
 *
 * 詳細は {@link ../../services/noteEventBroadcaster.ts} を参照。
 *
 * @see ../../services/noteEventBroadcaster.ts
 * @see ../admin/errors.ts （streamSSE / keep-alive / capacity check 元）
 * @see https://github.com/otomatty/zedi/issues/860
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { authOptional } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole } from "./helpers.js";
import {
  NOTE_EVENT_STREAM_MAX_SUBSCRIBERS,
  noteEventSubscriberCount,
  subscribeNoteEvents,
  type NoteEvent,
} from "../../services/noteEventBroadcaster.js";

const app = new Hono<AppEnv>();

/**
 * SSE 接続のキープアライブ間隔 (ms)。プロキシや LB がアイドル接続を切る前に
 * コメント行を送って TCP を温存する。`routes/admin/errors.ts` と同値。
 *
 * Keep-alive interval (ms) for SSE connections. Mirrors the value in
 * `routes/admin/errors.ts` so proxies and LBs see a consistent heartbeat
 * regardless of which feed the client subscribes to.
 */
const SSE_KEEPALIVE_MS = 25_000;

/**
 * `NoteEvent` を SSE wire 形式の `event` 名 + JSON `data` に整形する。
 *
 * Serialize a {@link NoteEvent} into the SSE event name + JSON data pair
 * consumed by `EventSource.addEventListener(name, ...)` on the client.
 */
function serializeNoteEvent(event: NoteEvent): { event: NoteEvent["type"]; data: string } {
  return { event: event.type, data: JSON.stringify(event) };
}

/**
 * GET /api/notes/:noteId/events
 *
 * - 404: ノートが存在しない / 削除済み。
 * - 403: ロール解決失敗（private / restricted を guest が要求した等）。
 * - 503: 購読者上限超過 ({@link NOTE_EVENT_STREAM_MAX_SUBSCRIBERS})。
 * - 200: `text/event-stream` を返し、`ready` イベントの直後から購読を開始する。
 *
 * - 404: missing or soft-deleted note.
 * - 403: caller has no role for the note (typical for guest hitting a private
 *   note).
 * - 503: subscriber cap reached; the client must back off before retrying.
 * - 200: SSE stream that emits a `ready` hello followed by `page.added` /
 *   `page.updated` / `page.deleted` / `note.permission_changed` events as they
 *   are published.
 */
app.get("/:noteId/events", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  // 上限チェックは streamSSE を呼ぶ前に行う。`streamSSE` が走り出すと
  // 200 + `text/event-stream` のレスポンスが既に開始されてしまい、503 へ
  // 降格できないため。クライアント側は 503 を見て backoff する想定。
  // Reject capacity exhaustion BEFORE `streamSSE` commits the response. Once
  // the helper sets `200 text/event-stream`, the status cannot be downgraded
  // to 503, so the cap is checked up front and surfaced as a real HTTP error
  // that EventSource will translate into a clean reconnect.
  if (noteEventSubscriberCount() >= NOTE_EVENT_STREAM_MAX_SUBSCRIBERS) {
    return c.json({ error: `subscriber cap reached (${NOTE_EVENT_STREAM_MAX_SUBSCRIBERS})` }, 503);
  }

  return streamSSE(
    c,
    async (stream) => {
      // Issue #860 Phase 4: subscribe BEFORE emitting `ready` so any event
      // published in the gap between handshake and subscription is not lost.
      // Codex P2 + coderabbitai PR #867 review.
      //
      // 購読登録を `ready` 送信の前に行い、両者の間に publish された
      // イベントが取りこぼされないようにする。`ready` の前に subscribe する
      // ことで、クライアントが `ready` を受け取った瞬間からはすべての
      // イベントが届く契約を成立させる。
      //
      // 上限はルート冒頭で確認済みのため通常 throw しないが、競合で同時に
      // 限界を超えた場合に備えて catch して接続を畳む。
      // Capacity is verified above, but a concurrent subscribe could still
      // exceed the cap; close cleanly if that race fires.
      // Issue #860 Phase 4: `note.permission_changed` を受信したら、それを
      // クライアントへ書き出した直後にストリームを閉じる。クライアントは
      // EventSource の自動再接続経由で `getNoteRole` を再評価するので、
      // 既にアクセス権を失ったユーザーには次の page.* イベントが届かない
      // (Codex P1 / coderabbitai critical on PR #867)。
      //
      // After delivering `note.permission_changed`, proactively close the
      // stream so the client reconnects through `getNoteRole` and a revoked
      // caller stops receiving subsequent `page.*` events. Combined with the
      // client-side rotation in `useNotePageEvents`, this gives instant
      // revocation without a per-event re-auth (Codex P1 / coderabbitai
      // critical on PR #867).
      let unsubscribe: (() => void) | null = null;
      try {
        let writeChain: Promise<void> = Promise.resolve();
        unsubscribe = subscribeNoteEvents(noteId, (event) => {
          writeChain = writeChain
            .then(async () => {
              if (stream.aborted || stream.closed) return;
              await stream.writeSSE(serializeNoteEvent(event));
              if (event.type === "note.permission_changed") {
                // 配信直後に購読を解放しつつストリームを閉じる。`stream.close()`
                // だけだと keep-alive ループの `await stream.sleep(...)` が
                // 25 秒沈黙したままなので、明示的に unsubscribe しないと購読者
                // スロットが解放されない。
                // Release the subscriber slot eagerly: `stream.close()` alone
                // doesn't wake the keep-alive `await stream.sleep(...)` loop,
                // so the listener would linger until the sleep returns 25 s
                // later. Explicit unsubscribe here matches the revocation
                // requirement immediately.
                unsubscribe?.();
                unsubscribe = null;
                await stream.close();
              }
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[note-events-stream] write failed: ${message}`);
            });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[note-events-stream] subscribe failed: ${message}`);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: "subscribe failed" }),
        });
        await stream.close();
        return;
      }

      // 購読登録より後のすべて（ready 書き込み + keep-alive ループ）を
      // try/finally で囲む。`stream.writeSSE("ready")` がクライアント切断中
      // などで throw した場合でも、finally で必ず購読を解放する。これを
      // しないと subscriber slot がリークし、最終的に capacity cap (256) を
      // 食い潰して 503 を出すようになる (coderabbitai major on PR #867)。
      //
      // Wrap everything after subscribe registration in try/finally. If the
      // initial `writeSSE("ready")` throws (e.g. client disconnected mid
      // handshake), the finally guarantees the subscriber slot is freed.
      // Without this guard a sequence of failed handshakes can exhaust the
      // 256-subscriber cap and start rejecting healthy clients with 503
      // (coderabbitai major on PR #867).
      stream.onAbort(() => {
        unsubscribe?.();
        unsubscribe = null;
      });

      try {
        // Subscription is live — now emit `ready`. From this point on the
        // client can rely on receiving every event the server publishes.
        await stream.writeSSE({
          event: "ready",
          data: JSON.stringify({ note_id: noteId }),
          retry: 30_000,
        });

        // クライアントが切断するまでキープアライブを送り続ける。生の SSE コメント
        // 行（`:` 始まり）を書く: `writeSSE` だと `event:` フィールドが必ず付与され、
        // クライアントは「無名イベント」を受信してしまうため (PR #816 review)。
        // Heartbeat loop: emit a raw SSE comment line every SSE_KEEPALIVE_MS so
        // idle proxies don't tear down the TCP connection. Using `write` (not
        // `writeSSE`) keeps the line as a comment instead of a named event.
        while (!stream.aborted && !stream.closed) {
          await stream.sleep(SSE_KEEPALIVE_MS);
          if (stream.aborted || stream.closed) break;
          await stream.write(": ping\n\n");
        }
      } finally {
        unsubscribe?.();
        unsubscribe = null;
      }
    },
    async (err, stream) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[note-events-stream] handler error: ${message}`);
      try {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "stream error" }) });
      } catch {
        /* swallow — connection likely closed */
      }
    },
  );
});

export default app;
