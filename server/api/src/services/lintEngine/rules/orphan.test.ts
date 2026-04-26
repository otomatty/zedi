/**
 * orphan ルールのテスト（被リンクなしページを finding にマッピング）。
 * Tests for the orphan rule's row → finding mapping.
 */
import { describe, it, expect } from "vitest";
import { runOrphanRule } from "./orphan.js";
import { createMockDb } from "../../../__tests__/createMockDb.js";
import type { Database } from "../../../types/index.js";

function asDb(results: unknown[]) {
  const { db, chains } = createMockDb(results);
  return { db: db as unknown as Database, chains };
}

describe("runOrphanRule", () => {
  it("returns rule='orphan' with no findings when no orphan rows are returned", async () => {
    const { db } = asDb([[]]);
    const result = await runOrphanRule("user-1", db);

    expect(result.rule).toBe("orphan");
    expect(result.findings).toEqual([]);
  });

  it("maps each orphan page into a single-page finding with severity=info", async () => {
    const { db } = asDb([
      [
        { id: "p-1", title: "Solo Page" },
        { id: "p-2", title: null },
      ],
    ]);

    const result = await runOrphanRule("user-1", db);

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toEqual({
      rule: "orphan",
      severity: "info",
      pageIds: ["p-1"],
      detail: { title: "Solo Page" },
    });
    // 無題ページのフォールバック。
    // null titles fall back to the bilingual placeholder.
    expect(result.findings[1]?.detail.title).toBe("(無題 / untitled)");
    expect(result.findings[1]?.pageIds).toEqual(["p-2"]);
  });

  it("starts exactly one select chain", async () => {
    const { db, chains } = asDb([[]]);
    await runOrphanRule("user-x", db);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.startMethod).toBe("select");
  });
});
