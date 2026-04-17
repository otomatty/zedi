/**
 * activityLogService の単体テスト。
 * Unit tests for activityLogService (recordActivity + listActivityForOwner).
 */
import { describe, it, expect, vi } from "vitest";
import { createMockDb } from "../createMockDb.js";
import {
  recordActivity,
  listActivityForOwner,
  ACTIVITY_LIST_DEFAULT_LIMIT,
  ACTIVITY_LIST_MAX_LIMIT,
} from "../../services/activityLogService.js";

describe("recordActivity", () => {
  it("inserts a row and returns the inserted record", async () => {
    const expected = {
      id: "act-1",
      ownerId: "user-1",
      kind: "lint_run" as const,
      actor: "user" as const,
      targetPageIds: [],
      detail: { total: 3 },
      createdAt: new Date("2026-04-17T00:00:00Z"),
    };
    const { db } = createMockDb([[expected]]);

    const result = await recordActivity(db as never, {
      ownerId: "user-1",
      kind: "lint_run",
      actor: "user",
      detail: { total: 3 },
    });
    expect(result).toEqual(expected);
  });

  it("returns null and does NOT throw on DB failure (non-fatal logging)", async () => {
    const db = {
      insert: () => {
        throw new Error("simulated db failure");
      },
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await recordActivity(db as never, {
      ownerId: "user-1",
      kind: "lint_run",
      actor: "user",
    });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("recordActivity failed (non-fatal)", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("defaults targetPageIds to [] when omitted", async () => {
    const { db, chains } = createMockDb([[{ id: "x" }]]);
    await recordActivity(db as never, {
      ownerId: "u",
      kind: "wiki_generate",
      actor: "ai",
    });
    const insertChain = chains[0];
    const valuesOp = insertChain?.ops.find((op) => op.method === "values");
    expect(valuesOp).toBeDefined();
    const firstArg = valuesOp?.args[0] as { targetPageIds: unknown[] };
    expect(firstArg.targetPageIds).toEqual([]);
  });
});

describe("listActivityForOwner", () => {
  it("clamps limit to [1, MAX] and offset to [0, ∞)", async () => {
    const { db, chains } = createMockDb([[], [{ count: 0 }]]);
    await listActivityForOwner(db as never, "u1", { limit: 9999, offset: -5 });
    const listChain = chains[0];
    const limitOp = listChain?.ops.find((op) => op.method === "limit");
    const offsetOp = listChain?.ops.find((op) => op.method === "offset");
    expect(limitOp?.args[0]).toBe(ACTIVITY_LIST_MAX_LIMIT);
    expect(offsetOp?.args[0]).toBe(0);
  });

  it("uses the default limit when none is provided", async () => {
    const { db, chains } = createMockDb([[], [{ count: 0 }]]);
    await listActivityForOwner(db as never, "u1");
    const listChain = chains[0];
    const limitOp = listChain?.ops.find((op) => op.method === "limit");
    expect(limitOp?.args[0]).toBe(ACTIVITY_LIST_DEFAULT_LIMIT);
  });

  it("returns rows and total from the count query", async () => {
    const fakeRow = {
      id: "a-1",
      ownerId: "u1",
      kind: "lint_run",
      actor: "user",
      targetPageIds: [],
      detail: null,
      createdAt: new Date(),
    };
    const { db } = createMockDb([[fakeRow], [{ count: 7 }]]);
    const res = await listActivityForOwner(db as never, "u1");
    expect(res.rows).toEqual([fakeRow]);
    expect(res.total).toBe(7);
  });

  it("returns total=0 when the count row is missing", async () => {
    const { db } = createMockDb([[], []]);
    const res = await listActivityForOwner(db as never, "u1");
    expect(res.total).toBe(0);
  });
});
