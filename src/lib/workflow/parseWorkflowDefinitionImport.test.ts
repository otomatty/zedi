import { describe, expect, it } from "vitest";
import { parseWorkflowDefinitionImport } from "./parseWorkflowDefinitionImport";

describe("parseWorkflowDefinitionImport", () => {
  it("parses minimal valid JSON", () => {
    const r = parseWorkflowDefinitionImport({
      name: "W",
      steps: [{ id: "a", title: "T", instruction: "Do" }],
    });
    expect(r.name).toBe("W");
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].title).toBe("T");
    expect(r.steps[0].instruction).toBe("Do");
  });

  it("rejects non-object root", () => {
    expect(() => parseWorkflowDefinitionImport(null)).toThrow();
  });

  it("rejects missing steps array", () => {
    expect(() => parseWorkflowDefinitionImport({ name: "x" })).toThrow();
  });

  it("rejects step without string title/instruction", () => {
    expect(() =>
      parseWorkflowDefinitionImport({
        name: "x",
        steps: [{ id: "1", title: 1, instruction: "a" }],
      }),
    ).toThrow();
  });

  it("accepts optional maxTurns and allowedTools", () => {
    const r = parseWorkflowDefinitionImport({
      name: "x",
      steps: [
        {
          title: "a",
          instruction: "b",
          maxTurns: 10,
          allowedTools: ["Read", "Bash"],
        },
      ],
    });
    expect(r.steps[0].maxTurns).toBe(10);
    expect(r.steps[0].allowedTools).toEqual(["Read", "Bash"]);
  });
});
