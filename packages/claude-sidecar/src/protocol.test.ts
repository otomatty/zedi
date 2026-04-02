import { describe, expect, it } from "vitest";
import { formatResponseLine, parseRequestLine } from "./protocol";

describe("parseRequestLine", () => {
  it("parses query request", () => {
    const r = parseRequestLine(
      JSON.stringify({
        type: "query",
        id: "a",
        prompt: "hi",
        cwd: "/tmp",
        maxTurns: 3,
      }),
    );
    expect(r).toEqual({
      type: "query",
      id: "a",
      prompt: "hi",
      cwd: "/tmp",
      maxTurns: 3,
    });
  });

  it("throws on empty", () => {
    expect(() => parseRequestLine("   ")).toThrow(/empty/);
  });
});

describe("formatResponseLine", () => {
  it("ends with newline and round-trips JSON", () => {
    const line = formatResponseLine({
      type: "stream-chunk",
      id: "x",
      content: "hello",
    });
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line.trim())).toEqual({
      type: "stream-chunk",
      id: "x",
      content: "hello",
    });
  });
});
