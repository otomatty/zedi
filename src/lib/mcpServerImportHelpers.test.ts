import { describe, it, expect } from "vitest";
import { isValidMcpServerConfig, normalizeImportedConfig } from "./mcpServerImportHelpers";

describe("normalizeImportedConfig", () => {
  it("normalizes http with string headers", () => {
    const c = normalizeImportedConfig({
      type: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer x", "X-Other": 1 },
    });
    expect(c).toEqual({
      type: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer x", "X-Other": "1" },
    });
  });

  it("normalizes stdio with env object", () => {
    const c = normalizeImportedConfig({
      command: "npx",
      args: ["-y", "pkg"],
      env: { FOO: true },
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.command).toBe("npx");
      expect(c.args).toEqual(["-y", "pkg"]);
      expect(c.env).toEqual({ FOO: "true" });
    }
  });
});

describe("isValidMcpServerConfig", () => {
  it("rejects stdio with empty command", () => {
    expect(isValidMcpServerConfig({ type: "stdio", command: "  ", args: [] })).toBe(false);
  });

  it("accepts stdio with command", () => {
    expect(isValidMcpServerConfig({ type: "stdio", command: "node" })).toBe(true);
  });

  it("rejects http with empty url", () => {
    expect(isValidMcpServerConfig({ type: "http", url: "   " })).toBe(false);
  });

  it("accepts http with url", () => {
    expect(isValidMcpServerConfig({ type: "http", url: "https://x" })).toBe(true);
  });
});
