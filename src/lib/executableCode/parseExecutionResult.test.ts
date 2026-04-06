import { describe, expect, it } from "vitest";
import { parseExecutionModelOutput, parseZediExecutionMarkers } from "./parseExecutionResult";

describe("parseZediExecutionMarkers", () => {
  it("parses stdout, stderr, and exit code", () => {
    const text = `intro
---ZEDI_STDOUT---
hello
---ZEDI_STDERR---
warn
---ZEDI_EXIT---
2
`;
    const r = parseZediExecutionMarkers(text);
    expect(r).toEqual({ stdout: "hello", stderr: "warn", exitCode: 2 });
  });

  it("returns null when markers are missing", () => {
    expect(parseZediExecutionMarkers("no markers")).toBeNull();
  });
});

describe("parseExecutionModelOutput", () => {
  it("falls back to full text as stdout when markers are absent", () => {
    expect(parseExecutionModelOutput("  plain  ")).toEqual({
      stdout: "plain",
      stderr: "",
      exitCode: 0,
    });
  });
});
