import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkflowExecution } from "./runWorkflowExecution";

vi.mock("@/lib/claudeCode/streamClaudeQuery", () => ({
  streamClaudeQuery: vi.fn(),
}));

import { streamClaudeQuery } from "@/lib/claudeCode/streamClaudeQuery";

describe("runWorkflowExecution", () => {
  beforeEach(() => {
    vi.mocked(streamClaudeQuery).mockReset();
  });

  it("returns error when there are no steps", async () => {
    const r = await runWorkflowExecution({
      definition: { id: "w", name: "W", steps: [], createdAt: 0, updatedAt: 0 },
      workflowSignal: new AbortController().signal,
      createStepAbort: () => new AbortController(),
      startStepIndex: 0,
      stepOutputs: [],
      onProgress: vi.fn(),
      onNoteMarkdown: vi.fn(),
      baseContentBeforeWorkflow: "",
    });
    expect(r).toEqual({ outcome: "error", error: "Workflow has no steps." });
  });

  it("runs one step and completes", async () => {
    vi.mocked(streamClaudeQuery).mockResolvedValue({ ok: true, content: "done" });

    const onNote = vi.fn();
    const r = await runWorkflowExecution({
      definition: {
        id: "w",
        name: "W",
        steps: [{ id: "s1", title: "Only", instruction: "Do work" }],
        createdAt: 0,
        updatedAt: 0,
      },
      workflowSignal: new AbortController().signal,
      createStepAbort: () => new AbortController(),
      startStepIndex: 0,
      stepOutputs: [],
      onProgress: vi.fn(),
      onNoteMarkdown: onNote,
      baseContentBeforeWorkflow: "base",
    });

    expect(r).toEqual({ outcome: "completed" });
    expect(streamClaudeQuery).toHaveBeenCalledTimes(1);
    const lastNote = onNote.mock.calls.at(-1)?.[0] as string;
    expect(lastNote).toContain("base");
    expect(lastNote).toContain("Workflow: W");
    expect(lastNote).toContain("done");
  });

  it("returns paused when only the step signal aborts", async () => {
    vi.mocked(streamClaudeQuery).mockResolvedValue({ ok: false, error: "Aborted" });

    const workflow = new AbortController();
    const step = new AbortController();
    let createCount = 0;
    const r = await runWorkflowExecution({
      definition: {
        id: "w",
        name: "W",
        steps: [{ id: "s1", title: "A", instruction: "x" }],
        createdAt: 0,
        updatedAt: 0,
      },
      workflowSignal: workflow.signal,
      createStepAbort: () => {
        createCount += 1;
        return step;
      },
      startStepIndex: 0,
      stepOutputs: [],
      onProgress: vi.fn(),
      onNoteMarkdown: vi.fn(),
      baseContentBeforeWorkflow: "",
    });

    expect(r.outcome).toBe("paused");
    if (r.outcome === "paused") {
      expect(r.pausedAtStepIndex).toBe(0);
      expect(r.stepOutputs).toEqual([""]);
    }
    expect(createCount).toBe(1);
  });
});
