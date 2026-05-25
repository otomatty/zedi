/**
 * Tests for terminal-status persistence on Wiki Compose sessions.
 */
import { describe, it, expect } from "vitest";
import { persistOutcomeIfStillRunning } from "../../routes/composeSessionPersistence.js";
import { createMockDb } from "../createMockDb.js";

describe("persistOutcomeIfStillRunning", () => {
  it("returns false without updating when no running row matches", async () => {
    const { db, chains } = createMockDb([[]]);
    const updated = await persistOutcomeIfStillRunning(db as never, "sess-cancelled", {
      status: "completed",
      lastError: null,
    });
    expect(updated).toBe(false);
    const updateChain = chains.find((c) => c.startMethod === "update");
    expect(updateChain?.ops.some((op) => op.method === "where")).toBe(true);
  });

  it("returns true when a running row is updated", async () => {
    const { db, chains } = createMockDb([[{ id: "sess-running" }]]);
    const updated = await persistOutcomeIfStillRunning(db as never, "sess-running", {
      status: "failed",
      lastError: "boom",
    });
    expect(updated).toBe(true);
    const setOp = chains
      .find((c) => c.startMethod === "update")
      ?.ops.find((op) => op.method === "set");
    expect((setOp?.args[0] as { status?: string })?.status).toBe("failed");
  });
});
