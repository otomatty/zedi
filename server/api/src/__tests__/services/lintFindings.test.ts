import { describe, it, expect } from "vitest";
import {
  getUnresolvedFindings,
  getFindingsForPage,
  DEFAULT_LINT_FINDINGS_LIMIT,
} from "../../services/lintEngine/index.js";
import type { Database } from "../../types/index.js";
import { createMockDb } from "../createMockDb.js";

/**
 * 未解決 findings の取得クエリに防御的上限 (LIMIT) が適用されることを検証する。
 * Verifies the unresolved-findings queries apply a defensive LIMIT so a user
 * with a huge backlog cannot pull an unbounded result set into memory.
 */
describe("lint findings queries apply a defensive LIMIT", () => {
  it("getUnresolvedFindings applies the default limit", async () => {
    const { db, chains } = createMockDb([[]]);

    await getUnresolvedFindings("owner-1", db as unknown as Database);

    const limitOp = chains[0]?.ops.find((op) => op.method === "limit");
    expect(limitOp).toBeDefined();
    expect(limitOp?.args).toEqual([DEFAULT_LINT_FINDINGS_LIMIT]);
  });

  it("getFindingsForPage applies the default limit", async () => {
    const { db, chains } = createMockDb([[]]);

    await getFindingsForPage("owner-1", "page-1", db as unknown as Database);

    const limitOp = chains[0]?.ops.find((op) => op.method === "limit");
    expect(limitOp).toBeDefined();
    expect(limitOp?.args).toEqual([DEFAULT_LINT_FINDINGS_LIMIT]);
  });
});
