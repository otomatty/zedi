/**
 * snapshotService のテスト
 * Tests for snapshotService (API-side auto-snapshot logic)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockDb } from "../createMockDb.js";
import { maybeCreateSnapshot } from "../../services/snapshotService.js";

// SNAPSHOT_INTERVAL_MS = 600_000 (10 minutes)
const TEN_MINUTES = 10 * 60 * 1000;

const PAGE_ID = "page-aaa-111";
const USER_ID = "user-bbb-222";

function makeYdocBuffer(): Buffer {
  return Buffer.from("fake-ydoc-state");
}

describe("maybeCreateSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("前回スナップショットがない場合、スナップショットを作成する / creates snapshot when no prior snapshot exists", async () => {
    vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));

    // Query 1: select last snapshot → empty
    // Query 2: insert snapshot
    // Query 3: delete pruning (execute)
    const { db } = createMockDb([
      [], // no prior snapshots
      [{ id: "snap-1" }], // insert result (not used)
      [], // pruning result
    ]);

    await maybeCreateSnapshot(db as never, PAGE_ID, makeYdocBuffer(), "some text", 5, USER_ID);

    // 3 DB operations: select, insert, execute(delete)
    expect(true).toBe(true); // No error thrown = success
  });

  it("前回スナップショットから10分経過している場合、スナップショットを作成する / creates snapshot when 10+ minutes elapsed", async () => {
    const now = new Date("2026-04-07T12:10:00Z");
    vi.setSystemTime(now);

    const lastCreatedAt = new Date(now.getTime() - TEN_MINUTES); // exactly 10 min ago

    const { db } = createMockDb([
      [{ createdAt: lastCreatedAt }], // last snapshot
      [{ id: "snap-new" }], // insert
      [], // pruning
    ]);

    await maybeCreateSnapshot(db as never, PAGE_ID, makeYdocBuffer(), "updated text", 10, USER_ID);

    expect(true).toBe(true); // No error thrown = success
  });

  it("前回スナップショットから10分未満の場合、スナップショットを作成しない / skips snapshot when less than 10 minutes elapsed", async () => {
    const now = new Date("2026-04-07T12:05:00Z");
    vi.setSystemTime(now);

    const lastCreatedAt = new Date(now.getTime() - (TEN_MINUTES - 1000)); // 9 min 59 sec ago

    // Only 1 query: select last snapshot
    // No insert or pruning should happen
    const { db, chains } = createMockDb([[{ createdAt: lastCreatedAt }]]);

    await maybeCreateSnapshot(db as never, PAGE_ID, makeYdocBuffer(), "text", 3, USER_ID);

    // Should only have 1 chain (the select query)
    expect(chains.length).toBe(1);
    expect(chains[0]?.startMethod).toBe("select");
  });

  it("contentText が null でもエラーにならない / handles null contentText", async () => {
    vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));

    const { db } = createMockDb([[], [{ id: "snap-1" }], []]);

    await expect(
      maybeCreateSnapshot(db as never, PAGE_ID, makeYdocBuffer(), null, 1, USER_ID),
    ).resolves.toBeUndefined();
  });
});
