/**
 * QueryActivityTracker のユニットテスト
 *
 * - start / end / clearAll の Set ベースの状態追跡
 * - snapshot() の status / activeQueryIds が常に正しい形になること
 *
 * Unit tests for the {@link QueryActivityTracker} state machine.
 */
import { describe, expect, it } from "vitest";
import { QueryActivityTracker } from "./status";

describe("QueryActivityTracker", () => {
  it("starts empty with status 'idle'", () => {
    const tracker = new QueryActivityTracker();
    const snap = tracker.snapshot();
    expect(snap.status).toBe("idle");
    expect(snap.activeQueryIds).toEqual([]);
  });

  it("transitions to 'processing' after start()", () => {
    const tracker = new QueryActivityTracker();
    tracker.start("q-1");
    const snap = tracker.snapshot();
    expect(snap.status).toBe("processing");
    expect(snap.activeQueryIds).toEqual(["q-1"]);
  });

  it("returns to 'idle' after every running query ends", () => {
    const tracker = new QueryActivityTracker();
    tracker.start("q-1");
    tracker.start("q-2");
    tracker.end("q-1");
    expect(tracker.snapshot().status).toBe("processing");
    expect(tracker.snapshot().activeQueryIds).toEqual(["q-2"]);
    tracker.end("q-2");
    expect(tracker.snapshot()).toEqual({ status: "idle", activeQueryIds: [] });
  });

  it("dedupes duplicate start() calls (Set semantics)", () => {
    // 重複 start でも 1 ID として扱う / Duplicate `start()` calls collapse to a single id.
    const tracker = new QueryActivityTracker();
    tracker.start("q-1");
    tracker.start("q-1");
    expect(tracker.snapshot().activeQueryIds).toEqual(["q-1"]);
    tracker.end("q-1");
    expect(tracker.snapshot().status).toBe("idle");
  });

  it("end() on an unknown id is a no-op", () => {
    // 未知の ID を end() しても例外にならず状態も変えない / Unknown end() must not throw or mutate state.
    const tracker = new QueryActivityTracker();
    tracker.start("q-1");
    expect(() => tracker.end("does-not-exist")).not.toThrow();
    expect(tracker.snapshot().activeQueryIds).toEqual(["q-1"]);
  });

  it("clearAll() empties active ids without aborting controllers", () => {
    // shutdown 用: 状態だけクリアし、AbortController には触れない / clearAll only clears tracked ids.
    const tracker = new QueryActivityTracker();
    tracker.start("a");
    tracker.start("b");
    tracker.clearAll();
    expect(tracker.snapshot()).toEqual({ status: "idle", activeQueryIds: [] });
  });

  it("snapshot() returns an isolated array (mutation safety)", () => {
    // 返却された配列を改変しても内部状態には影響しないこと / Returned array must be a copy.
    const tracker = new QueryActivityTracker();
    tracker.start("q-1");
    const snap = tracker.snapshot();
    snap.activeQueryIds.push("rogue");
    expect(tracker.snapshot().activeQueryIds).toEqual(["q-1"]);
  });

  it("preserves insertion order of active query ids", () => {
    // Set の挿入順を保つことに依存するクライアントがあるため、順序保証を明示する。
    // Some clients depend on insertion order, so we explicitly assert it.
    const tracker = new QueryActivityTracker();
    tracker.start("third");
    tracker.start("first");
    tracker.start("second");
    expect(tracker.snapshot().activeQueryIds).toEqual(["third", "first", "second"]);
  });
});
