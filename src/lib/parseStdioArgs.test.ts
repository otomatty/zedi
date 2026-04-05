import { describe, expect, it } from "vitest";
import { parseStdioArgsLine } from "./parseStdioArgs";

describe("parseStdioArgsLine", () => {
  it("splits on whitespace", () => {
    expect(parseStdioArgsLine("a b c")).toEqual(["a", "b", "c"]);
  });

  it("preserves quoted segments with spaces", () => {
    expect(parseStdioArgsLine('--path "C:\\Program Files\\foo"')).toEqual([
      "--path",
      "C:\\Program Files\\foo",
    ]);
  });

  it("handles single-quoted segments", () => {
    expect(parseStdioArgsLine("--x '/my path/file'")).toEqual(["--x", "/my path/file"]);
  });

  it("returns empty array for blank", () => {
    expect(parseStdioArgsLine("   ")).toEqual([]);
  });

  it("strips outer quotes from double-quoted token", () => {
    expect(parseStdioArgsLine('"one two" three')).toEqual(["one two", "three"]);
  });
});
