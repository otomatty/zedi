/**
 * brokenLink ルールのテスト（モック DB から返した行を finding にマッピングできるか）。
 * Tests for the broken-link rule's row → finding mapping using a mocked db.
 */
import { describe, it, expect } from "vitest";
import { runBrokenLinkRule } from "./brokenLink.js";
import { createMockDb } from "../../../__tests__/createMockDb.js";
import type { Database } from "../../../types/index.js";

function asDb(results: unknown[]) {
  const { db, chains } = createMockDb(results);
  return { db: db as unknown as Database, chains };
}

describe("runBrokenLinkRule", () => {
  it("returns rule='broken_link' with no findings when no broken rows are returned", async () => {
    const { db } = asDb([[]]);
    const result = await runBrokenLinkRule("user-1", db);

    expect(result.rule).toBe("broken_link");
    expect(result.findings).toEqual([]);
  });

  it("maps each broken row into a finding with severity=error and both page IDs", async () => {
    const { db } = asDb([
      [
        { sourceId: "src-1", targetId: "tgt-1", sourceTitle: "Important Page" },
        { sourceId: "src-2", targetId: "tgt-2", sourceTitle: null },
      ],
    ]);

    const result = await runBrokenLinkRule("user-1", db);

    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toEqual({
      rule: "broken_link",
      severity: "error",
      pageIds: ["src-1", "tgt-1"],
      detail: {
        sourceTitle: "Important Page",
        sourceId: "src-1",
        targetId: "tgt-1",
        suggestion: expect.stringMatching(/link target has been deleted/i),
      },
    });

    // 無題ページのフォールバックタイトル。
    // null titles fall back to the bilingual "(無題 / untitled)" placeholder.
    expect(result.findings[1]?.detail.sourceTitle).toBe("(無題 / untitled)");
  });

  it("scopes the query to ownerId via Drizzle (chain inspection)", async () => {
    const { db, chains } = asDb([[]]);
    await runBrokenLinkRule("user-x", db);

    // 1 つの select チェーンが消費される。
    // Exactly one chain is started for the SELECT.
    expect(chains).toHaveLength(1);
    expect(chains[0]?.startMethod).toBe("select");
  });
});
