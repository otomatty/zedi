/**
 * `noteEventBroadcaster` 単体テスト。
 * subscribe / publish / capacity / unsubscribe の挙動を検証する。
 *
 * Unit tests for the in-memory `noteEventBroadcaster` (subscribe, publish,
 * capacity guard, unsubscribe cleanup). Mirrors `apiErrorBroadcaster.test.ts`
 * style but partitions listeners by `noteId` so an event for note A is not
 * delivered to subscribers of note B.
 *
 * @see ../../services/noteEventBroadcaster.ts
 * @see https://github.com/otomatty/zedi/issues/860
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTE_EVENT_STREAM_MAX_SUBSCRIBERS,
  NoteEventStreamCapacityExceededError,
  clearNoteEventSubscribers,
  noteEventSubscriberCount,
  publishNoteEvent,
  subscribeNoteEvents,
  type NoteEvent,
} from "../../services/noteEventBroadcaster.js";

const NOTE_A = "00000000-0000-4000-8000-00000000000a";
const NOTE_B = "00000000-0000-4000-8000-00000000000b";

function makeAddedEvent(noteId: string, pageId = "pg-1"): NoteEvent {
  return {
    type: "page.added",
    note_id: noteId,
    page: {
      id: pageId,
      owner_id: "owner-1",
      note_id: noteId,
      source_page_id: null,
      title: "New page",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      created_at: new Date("2026-05-13T00:00:00Z"),
      updated_at: new Date("2026-05-13T00:00:00Z"),
      is_deleted: false,
    },
  };
}

afterEach(() => {
  clearNoteEventSubscribers();
});

describe("noteEventBroadcaster", () => {
  it("delivers published events to every subscriber for the same note", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeNoteEvents(NOTE_A, a);
    subscribeNoteEvents(NOTE_A, b);

    const event = makeAddedEvent(NOTE_A);
    publishNoteEvent(event);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith(event);
  });

  it("does not deliver events to subscribers of a different note", () => {
    // ノートごとに購読を分離することが本ブロードキャスタの存在理由。`note_id`
    // が違うイベントは決して別ノートの購読者へ漏れてはいけない。
    // Note partitioning is the whole point of this broadcaster: events for one
    // note must never leak to subscribers of another.
    const onA = vi.fn();
    const onB = vi.fn();
    subscribeNoteEvents(NOTE_A, onA);
    subscribeNoteEvents(NOTE_B, onB);

    publishNoteEvent(makeAddedEvent(NOTE_A));

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe and trims the bucket", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNoteEvents(NOTE_A, listener);
    unsubscribe();

    publishNoteEvent(makeAddedEvent(NOTE_A));

    expect(listener).not.toHaveBeenCalled();
    expect(noteEventSubscriberCount(NOTE_A)).toBe(0);
    expect(noteEventSubscriberCount()).toBe(0);
  });

  it("isolates a throwing subscriber from the rest", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeNoteEvents(NOTE_A, bad);
    subscribeNoteEvents(NOTE_A, good);

    publishNoteEvent(makeAddedEvent(NOTE_A));

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("rejects subscribe past the cap", () => {
    // 上限まで埋めて、もう 1 つ subscribe しようとすると例外で弾かれる。
    // Fill to the cap; the next subscribe must throw the capacity error so the
    // SSE route can map it to a 503 instead of silently dropping events.
    for (let i = 0; i < NOTE_EVENT_STREAM_MAX_SUBSCRIBERS; i++) {
      subscribeNoteEvents(NOTE_A, () => {});
    }
    expect(() => subscribeNoteEvents(NOTE_A, () => {})).toThrow(
      NoteEventStreamCapacityExceededError,
    );
    expect(noteEventSubscriberCount()).toBe(NOTE_EVENT_STREAM_MAX_SUBSCRIBERS);
  });

  it("counts active subscribers globally and per-note", () => {
    expect(noteEventSubscriberCount()).toBe(0);
    expect(noteEventSubscriberCount(NOTE_A)).toBe(0);

    const u1 = subscribeNoteEvents(NOTE_A, () => {});
    const u2 = subscribeNoteEvents(NOTE_A, () => {});
    const u3 = subscribeNoteEvents(NOTE_B, () => {});

    expect(noteEventSubscriberCount()).toBe(3);
    expect(noteEventSubscriberCount(NOTE_A)).toBe(2);
    expect(noteEventSubscriberCount(NOTE_B)).toBe(1);

    u1();
    u2();
    expect(noteEventSubscriberCount(NOTE_A)).toBe(0);
    expect(noteEventSubscriberCount()).toBe(1);
    u3();
    expect(noteEventSubscriberCount()).toBe(0);
  });

  it("treats a double-subscribe of the same listener as one slot (coderabbitai PR #867)", () => {
    // `Set.add` は冪等なので、同じ listener を 2 回 subscribe しても bucket には
    // 1 つしか入らない。totalSubscribers がそれに同期していないと、unsubscribe
    // 1 回で計数だけが 1 残ってしまい capacity を誤って 503 にする恐れがある。
    // Subscribing the same listener twice must not inflate the counter — the
    // Set holds at most one reference, so unsubscribe accounting has to match.
    const listener = vi.fn();
    const unsubscribeA = subscribeNoteEvents(NOTE_A, listener);
    const unsubscribeB = subscribeNoteEvents(NOTE_A, listener);

    expect(noteEventSubscriberCount()).toBe(1);
    expect(noteEventSubscriberCount(NOTE_A)).toBe(1);

    // どちらの unsubscribe を呼んでも最終的に 0 に戻る。
    // Either unsubscribe collapses to 0 in the end.
    unsubscribeA();
    expect(noteEventSubscriberCount()).toBe(0);
    unsubscribeB();
    expect(noteEventSubscriberCount()).toBe(0);

    // 配信もたかが 1 回。
    // Dispatch only fires once.
    subscribeNoteEvents(NOTE_A, listener);
    publishNoteEvent(makeAddedEvent(NOTE_A));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers different event types (deleted, permission_changed)", () => {
    // 別バリアントの discriminated union が無加工で listener に渡ること。
    // Other event variants flow through the same channel unchanged.
    const listener = vi.fn();
    subscribeNoteEvents(NOTE_A, listener);

    const deleted: NoteEvent = { type: "page.deleted", note_id: NOTE_A, page_id: "pg-1" };
    const perm: NoteEvent = { type: "note.permission_changed", note_id: NOTE_A };

    publishNoteEvent(deleted);
    publishNoteEvent(perm);

    expect(listener).toHaveBeenNthCalledWith(1, deleted);
    expect(listener).toHaveBeenNthCalledWith(2, perm);
  });
});
