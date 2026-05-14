/**
 * `GET /api/notes/:noteId/events` 統合テスト (Issue #860 Phase 4)。
 *
 * Hono の `streamSSE` 経由で SSE をストリーミングするため、`app.request` の戻り
 * `Response` から `body.getReader()` でチャンクを読みつつ、`ready` イベントと
 * 続けて publish したイベントが期待した順番で流れることを検証する。
 *
 * Integration tests for `GET /api/notes/:noteId/events` (Issue #860 Phase 4).
 * Streams the SSE body via `Response.body.getReader()` and asserts that the
 * `ready` event and subsequently published events arrive in order. Mirrors
 * the test style of `pages.test.ts` for the auth/mock-DB shape.
 *
 * @see ../../../routes/notes/events.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (userId) c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
}));

import {
  TEST_USER_ID,
  OTHER_USER_ID,
  TEST_USER_EMAIL,
  createMockNote,
  createTestApp,
  authHeaders,
} from "./setup.js";
import {
  clearNoteEventSubscribers,
  noteEventSubscriberCount,
  publishNoteEvent,
  type NoteEvent,
} from "../../../services/noteEventBroadcaster.js";

const NOTE_ID = "note-test-001";

afterEach(() => {
  clearNoteEventSubscribers();
});

/**
 * `Response.body` を 1 度だけ getReader() するためのラッパ。テスト中に同じ
 * body から複数回フレーム取得したい用途で使う。`close()` でロック解放と
 * 購読解除（サーバ abort）を起こす。
 *
 * Helper that locks `response.body` exactly once with `getReader()` and lets
 * callers pull SSE frames incrementally. Releasing the reader via `close()`
 * triggers the server-side `stream.onAbort` so the subscriber count drops.
 */
function openSseReader(response: Response, timeoutMs = 1_000) {
  const body = response.body;
  if (!body) throw new Error("Response.body is null");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;

  /**
   * Pulls up to `count` frames (each ending in `\n\n`). Keep-alive comment
   * frames are skipped so tests can focus on real events.
   * `count` 件分のフレーム（`\n\n` 区切り）を取得する。`:` で始まるコメント行
   * （キープアライブ）はスキップする。
   */
  async function readFrames(count: number): Promise<string[]> {
    const frames: string[] = [];
    const start = Date.now();
    while (frames.length < count) {
      if (Date.now() - start > timeoutMs) break;
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), timeoutMs),
      );
      const { value, done } = (await Promise.race([readPromise, timeoutPromise])) as {
        value?: Uint8Array;
        done?: boolean;
      };
      if (done || !value) break;
      buffer += decoder.decode(value, { stream: true });
      while (buffer.includes("\n\n")) {
        const idx = buffer.indexOf("\n\n");
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = frame.split("\n").filter((l) => !l.startsWith(":"));
        if (lines.length === 0) continue;
        frames.push(lines.join("\n"));
        if (frames.length >= count) break;
      }
    }
    return frames;
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await reader.cancel().catch(() => {});
  }

  return { readFrames, close };
}

/**
 * 1 つの SSE フレーム文字列を `{ event, data }` にパースする。
 * Parse a single SSE frame string into its `event:` / `data:` fields.
 */
function parseSseFrame(frame: string): { event: string | null; data: string } {
  let event: string | null = null;
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data = line.slice(5).trim();
  }
  return { event, data };
}

describe("GET /api/notes/:noteId/events", () => {
  it("returns 404 when the note is missing", async () => {
    // findActiveNoteById が空配列を返すパス。
    // `findActiveNoteById` returns an empty result, so the route 404s.
    const { app } = createTestApp([[]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/events`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller has no role for the note", async () => {
    // private ノートを別ユーザーが要求 → guest にもならず role = null。
    // Private note + non-owner caller → role resolves to null → 403.
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "private" });
    const { app } = createTestApp([[mockNote], [], []]);

    const res = await app.request(`/api/notes/${NOTE_ID}/events`, {
      method: "GET",
      headers: authHeaders(TEST_USER_ID, TEST_USER_EMAIL),
    });

    expect(res.status).toBe(403);
  });

  it("delivers the ready hello followed by published events to the subscriber", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/events`, {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");

    const sse = openSseReader(res);
    try {
      // `ready` を待ってから publish する。streamSSE の初期 writeSSE が flush
      // されるのは subscribe より僅かに後なので、最初のフレームを読み取ってから
      // publish することでテストが安定する。
      // Read the initial `ready` frame first so we know subscription is wired,
      // then publish; otherwise the publish can race the subscribe registration.
      const readyOnly = await sse.readFrames(1);
      expect(readyOnly).toHaveLength(1);
      const ready = parseSseFrame(readyOnly[0] ?? "");
      expect(ready.event).toBe("ready");
      expect(JSON.parse(ready.data)).toEqual({ note_id: NOTE_ID });

      const addedEvent: NoteEvent = {
        type: "page.added",
        note_id: NOTE_ID,
        page: {
          id: "pg-new",
          owner_id: TEST_USER_ID,
          note_id: NOTE_ID,
          source_page_id: null,
          title: "Hello",
          content_preview: "preview",
          thumbnail_url: null,
          source_url: null,
          created_at: new Date("2026-05-13T00:00:00Z"),
          updated_at: new Date("2026-05-13T00:00:00Z"),
          is_deleted: false,
        },
      };
      publishNoteEvent(addedEvent);

      const moreFrames = await sse.readFrames(1);
      expect(moreFrames).toHaveLength(1);
      const added = parseSseFrame(moreFrames[0] ?? "");
      expect(added.event).toBe("page.added");
      const addedData = JSON.parse(added.data) as NoteEvent;
      expect(addedData.type).toBe("page.added");
      expect(addedData.note_id).toBe(NOTE_ID);
      if (addedData.type === "page.added") {
        expect(addedData.page.id).toBe("pg-new");
        expect(addedData.page.title).toBe("Hello");
      }
    } finally {
      await sse.close();
    }
  });

  it("subscribes the caller for the duration of the stream and cleans up on cancel", async () => {
    const mockNote = createMockNote();
    const { app } = createTestApp([[mockNote]]);

    expect(noteEventSubscriberCount(NOTE_ID)).toBe(0);
    const res = await app.request(`/api/notes/${NOTE_ID}/events`, {
      method: "GET",
      headers: authHeaders(),
    });

    const sse = openSseReader(res);
    // Wait for `ready` so subscription is definitely registered before we
    // assert the count.
    await sse.readFrames(1);
    expect(noteEventSubscriberCount(NOTE_ID)).toBe(1);

    // Cancelling the reader triggers the abort path on the server side.
    await sse.close();
    // Allow the abort microtasks to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(noteEventSubscriberCount(NOTE_ID)).toBe(0);
  });

  it("allows guest access on public notes (authOptional)", async () => {
    const mockNote = createMockNote({ ownerId: OTHER_USER_ID, visibility: "public" });
    const { app } = createTestApp([[mockNote]]);

    const res = await app.request(`/api/notes/${NOTE_ID}/events`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    const sse = openSseReader(res);
    try {
      const frames = await sse.readFrames(1);
      expect(frames).toHaveLength(1);
      const ready = parseSseFrame(frames[0] ?? "");
      expect(ready.event).toBe("ready");
    } finally {
      await sse.close();
    }
  });
});
