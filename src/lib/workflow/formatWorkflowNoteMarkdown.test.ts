import { describe, expect, it } from "vitest";
import { formatWorkflowNoteMarkdown } from "./formatWorkflowNoteMarkdown";

describe("formatWorkflowNoteMarkdown", () => {
  it("renders title and step markers", () => {
    const md = formatWorkflowNoteMarkdown({
      title: "Test",
      stepTitles: ["A", "B"],
      stepStatuses: ["done", "pending"],
      stepOutputs: ["out-a", ""],
      streamingStepIndex: null,
      streamingText: "",
    });
    expect(md).toContain("## 📋 Workflow: Test");
    expect(md).toContain("### ☑ 1. A");
    expect(md).toContain("out-a");
    expect(md).toContain("### ⬜ 2. B");
  });

  it("includes streaming text for the running step", () => {
    const md = formatWorkflowNoteMarkdown({
      title: "S",
      stepTitles: ["One"],
      stepStatuses: ["running"],
      stepOutputs: [""],
      streamingStepIndex: 0,
      streamingText: "partial...",
    });
    expect(md).toContain("### 🔄 1. One");
    expect(md).toContain("partial...");
  });
});
