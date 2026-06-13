/**
 * Checkpoint helper tests for Wiki Compose session runs.
 */
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { describe, it, expect, vi } from "vitest";
import { clearComposeThreadCheckpoint } from "../../../../agents/core/checkpoint/index.js";

describe("clearComposeThreadCheckpoint", () => {
  it("no-ops when checkpointer is disabled", async () => {
    await expect(clearComposeThreadCheckpoint("thread-1", false)).resolves.toBeUndefined();
  });

  it("calls deleteThread when the saver supports it", async () => {
    const deleteThread = vi.fn().mockResolvedValue(undefined);
    await clearComposeThreadCheckpoint("thread-2", {
      deleteThread,
    } as unknown as BaseCheckpointSaver);
    expect(deleteThread).toHaveBeenCalledWith("thread-2");
  });

  it("no-ops when deleteThread is absent", async () => {
    await expect(clearComposeThreadCheckpoint("thread-3", {} as never)).resolves.toBeUndefined();
  });
});
