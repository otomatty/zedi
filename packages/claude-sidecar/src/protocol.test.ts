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

  it("throws on unknown type", () => {
    expect(() => parseRequestLine(JSON.stringify({ type: "nope" }))).toThrow(
      /unknown request type/,
    );
  });

  it("throws when query is missing id or prompt", () => {
    expect(() => parseRequestLine(JSON.stringify({ type: "query", id: "a" }))).toThrow(/prompt/);
    expect(() => parseRequestLine(JSON.stringify({ type: "query", prompt: "hi" }))).toThrow(/id/);
  });

  it("rejects wrong-typed query fields", () => {
    expect(() =>
      parseRequestLine(JSON.stringify({ type: "query", id: "a", prompt: "hi", cwd: 5 })),
    ).toThrow(/cwd/);
    expect(() =>
      parseRequestLine(
        JSON.stringify({ type: "query", id: "a", prompt: "hi", allowedTools: [1, 2] }),
      ),
    ).toThrow(/allowedTools/);
  });

  it("validates and normalizes a stdio mcpServers entry", () => {
    const r = parseRequestLine(
      JSON.stringify({
        type: "query",
        id: "a",
        prompt: "hi",
        mcpServers: { fs: { command: "node", args: ["server.js"], env: { K: "v" } } },
        // unknown top-level fields are stripped, not forwarded.
        extra: "drop-me",
      }),
    );
    expect(r).toEqual({
      type: "query",
      id: "a",
      prompt: "hi",
      mcpServers: { fs: { command: "node", args: ["server.js"], env: { K: "v" } } },
    });
  });

  it("rejects malformed mcpServers entries", () => {
    expect(() =>
      parseRequestLine(
        JSON.stringify({ type: "query", id: "a", prompt: "hi", mcpServers: { bad: { args: [] } } }),
      ),
    ).toThrow(/mcpServers/);
    expect(() =>
      parseRequestLine(
        JSON.stringify({
          type: "query",
          id: "a",
          prompt: "hi",
          mcpServers: { bad: { command: "x", env: { K: 1 } } },
        }),
      ),
    ).toThrow(/mcpServers/);
  });

  it("validates abort and correlation-id requests", () => {
    expect(parseRequestLine(JSON.stringify({ type: "abort", id: "x" }))).toEqual({
      type: "abort",
      id: "x",
    });
    expect(parseRequestLine(JSON.stringify({ type: "status", correlationId: "c" }))).toEqual({
      type: "status",
      correlationId: "c",
    });
    expect(() => parseRequestLine(JSON.stringify({ type: "abort" }))).toThrow(/id/);
    expect(() => parseRequestLine(JSON.stringify({ type: "status" }))).toThrow(/correlationId/);
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
