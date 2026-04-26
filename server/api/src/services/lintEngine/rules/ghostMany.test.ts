/**
 * ghostMany ルールのテスト（同 link_text が複数ページから参照される行を finding に変換）。
 * Tests for the ghost-many rule's row → finding mapping.
 */
import { describe, it, expect } from "vitest";
import { runGhostManyRule } from "./ghostMany.js";
import { createMockDb } from "../../../__tests__/createMockDb.js";
import type { Database } from "../../../types/index.js";

function asDb(results: unknown[]) {
  const { db, chains } = createMockDb(results);
  return { db: db as unknown as Database, chains };
}

describe("runGhostManyRule", () => {
  it("returns rule='ghost_many' with no findings when no rows pass the threshold", async () => {
    const { db } = asDb([[]]);
    const result = await runGhostManyRule("user-1", db);

    expect(result.rule).toBe("ghost_many");
    expect(result.findings).toEqual([]);
  });

  it("maps each row to a finding with severity=warn and the source page IDs", async () => {
    const { db } = asDb([
      [
        { linkText: "TODO", count: 5, sourcePageIds: ["p-1", "p-2", "p-3"] },
        { linkText: "Roadmap", count: 3, sourcePageIds: ["p-4", "p-5", "p-6"] },
      ],
    ]);

    const result = await runGhostManyRule("user-1", db);

    expect(result.findings).toHaveLength(2);
    const todo = result.findings[0];
    expect(todo).toMatchObject({
      rule: "ghost_many",
      severity: "warn",
      pageIds: ["p-1", "p-2", "p-3"],
    });
    expect(todo?.detail.linkText).toBe("TODO");
    expect(todo?.detail.count).toBe(5);
    expect(String(todo?.detail.suggestion)).toContain("TODO");

    const roadmap = result.findings[1];
    expect(roadmap?.pageIds).toEqual(["p-4", "p-5", "p-6"]);
    expect(roadmap?.detail.count).toBe(3);
  });

  it("starts exactly one select chain with where + having (HAVING shares the chain)", async () => {
    const { db, chains } = asDb([[]]);
    await runGhostManyRule("user-x", db);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.startMethod).toBe("select");
    // owner フィルタと閾値ハービング両方が外れていないことの最低限の保険。
    // Floor check that neither the owner filter nor the count threshold is silently dropped.
    expect(chains[0]?.ops.some((op) => op.method === "where")).toBe(true);
    expect(chains[0]?.ops.some((op) => op.method === "having")).toBe(true);
  });
});
