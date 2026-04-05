import { describe, expect, it } from "vitest";
import { buildWorkflowStepPrompt, defaultWorkflowStepMaxTurns } from "./buildWorkflowStepPrompt";

describe("buildWorkflowStepPrompt", () => {
  it("includes step meta, instruction, and prior outputs", () => {
    const text = buildWorkflowStepPrompt({
      workflowName: "W",
      step: { id: "s2", title: "Design", instruction: "Propose schema." },
      stepIndex: 1,
      totalSteps: 3,
      priorOutputs: ["analysis done"],
    });
    expect(text).toContain("step 2 of 3");
    expect(text).toContain("Design");
    expect(text).toContain("Propose schema.");
    expect(text).toContain("analysis done");
  });

  it("adds page excerpt and resume partial when provided", () => {
    const text = buildWorkflowStepPrompt({
      workflowName: "W",
      step: { id: "s1", title: "T", instruction: "Go" },
      stepIndex: 0,
      totalSteps: 1,
      pageExcerpt: "Note body",
      priorOutputs: [],
      resumeFromPartial: "half-done",
    });
    expect(text).toContain("Note body");
    expect(text).toContain("half-done");
  });
});

describe("defaultWorkflowStepMaxTurns", () => {
  it("falls back to 15 when maxTurns is missing", () => {
    expect(defaultWorkflowStepMaxTurns({ id: "a", title: "t", instruction: "i" })).toBe(15);
  });

  it("uses explicit maxTurns", () => {
    expect(
      defaultWorkflowStepMaxTurns({ id: "a", title: "t", instruction: "i", maxTurns: 7 }),
    ).toBe(7);
  });
});
