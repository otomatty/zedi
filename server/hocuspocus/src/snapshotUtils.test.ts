/**
 * snapshotUtils のテスト（hocuspocus 用）
 * Tests for snapshotUtils (hocuspocus-side auto-snapshot logic)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  maybeCreateSnapshot,
  SNAPSHOT_INTERVAL_MS,
  MAX_SNAPSHOTS_PER_PAGE,
} from "./snapshotUtils.js";
import type { PoolClient } from "pg";

const PAGE_ID = "page-aaa-111";

function makeEncodedState(): Buffer {
  return Buffer.from("fake-ydoc-state");
}

/**
 * PoolClient のモックを作成する。query の呼び出し順序で結果を返す。
 * Creates a mock PoolClient that returns results in call order.
 */
function createMockClient(queryResults: { rows: unknown[] }[]): {
  client: PoolClient;
  queryCalls: { text: string; values: unknown[] }[];
} {
  let callIndex = 0;
  const queryCalls: { text: string; values: unknown[] }[] = [];

  const client = {
    query: vi.fn().mockImplementation((text: string, values?: unknown[]) => {
      queryCalls.push({ text, values: values ?? [] });
      const result = queryResults[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(result);
    }),
  } as unknown as PoolClient;

  return { client, queryCalls };
}

describe("snapshotUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  describe("定数 / Constants", () => {
    it("SNAPSHOT_INTERVAL_MS は 10分（600000ms）である", () => {
      expect(SNAPSHOT_INTERVAL_MS).toBe(10 * 60 * 1000);
    });

    it("MAX_SNAPSHOTS_PER_PAGE は 100 である", () => {
      expect(MAX_SNAPSHOTS_PER_PAGE).toBe(100);
    });
  });

  describe("maybeCreateSnapshot", () => {
    it("前回スナップショットがない場合、スナップショットを作成する / creates snapshot when no prior snapshot exists", async () => {
      vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));

      const { client, queryCalls } = createMockClient([
        { rows: [] }, // no prior snapshots
        { rows: [{ version: "5" }] }, // version query
        { rows: [] }, // insert
        { rows: [] }, // pruning
      ]);

      await maybeCreateSnapshot(client, PAGE_ID, makeEncodedState(), "hello");

      // 4 queries: select last snap, select version, insert, delete pruning
      expect(queryCalls.length).toBe(4);
      expect(queryCalls[0]?.text).toContain("page_snapshots");
      expect(queryCalls[2]?.text).toContain("INSERT INTO page_snapshots");
      expect(queryCalls[2]?.values).toContain(PAGE_ID);
      expect(queryCalls[3]?.text).toContain("DELETE FROM page_snapshots");
    });

    it("前回スナップショットから10分経過している場合、スナップショットを作成する / creates snapshot when 10+ minutes elapsed", async () => {
      const now = new Date("2026-04-07T12:10:00Z");
      vi.setSystemTime(now);

      const lastCreatedAt = new Date(now.getTime() - SNAPSHOT_INTERVAL_MS);

      const { client, queryCalls } = createMockClient([
        { rows: [{ created_at: lastCreatedAt }] },
        { rows: [{ version: "10" }] },
        { rows: [] }, // insert
        { rows: [] }, // pruning
      ]);

      await maybeCreateSnapshot(client, PAGE_ID, makeEncodedState(), "content");

      expect(queryCalls.length).toBe(4);
      expect(queryCalls[2]?.text).toContain("INSERT INTO page_snapshots");
    });

    it("前回スナップショットから10分未満の場合、スナップショットを作成しない / skips when less than 10 minutes elapsed", async () => {
      const now = new Date("2026-04-07T12:05:00Z");
      vi.setSystemTime(now);

      const lastCreatedAt = new Date(now.getTime() - (SNAPSHOT_INTERVAL_MS - 1000));

      const { client, queryCalls } = createMockClient([{ rows: [{ created_at: lastCreatedAt }] }]);

      await maybeCreateSnapshot(client, PAGE_ID, makeEncodedState(), "content");

      // Only 1 query: the initial snapshot check
      expect(queryCalls.length).toBe(1);
    });

    it("version が存在しない場合、デフォルトの version 1 を使用する / uses version 1 when no version row exists", async () => {
      vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));

      const { client, queryCalls } = createMockClient([
        { rows: [] }, // no prior snapshots
        { rows: [] }, // no version row
        { rows: [] }, // insert
        { rows: [] }, // pruning
      ]);

      await maybeCreateSnapshot(client, PAGE_ID, makeEncodedState(), "text");

      // insert query should use version = 1
      const insertValues = queryCalls[2]?.values;
      expect(insertValues?.[1]).toBe(1);
    });

    it("pruning クエリで MAX_SNAPSHOTS_PER_PAGE を使用する / prune uses MAX_SNAPSHOTS_PER_PAGE", async () => {
      vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));

      const { client, queryCalls } = createMockClient([
        { rows: [] },
        { rows: [{ version: "1" }] },
        { rows: [] },
        { rows: [] },
      ]);

      await maybeCreateSnapshot(client, PAGE_ID, makeEncodedState(), "text");

      const pruneValues = queryCalls[3]?.values;
      expect(pruneValues).toContain(MAX_SNAPSHOTS_PER_PAGE);
    });
  });
});
