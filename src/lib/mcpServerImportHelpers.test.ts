import { describe, it, expect } from "vitest";
import { isValidMcpServerConfig, normalizeImportedConfig } from "./mcpServerImportHelpers";

describe("normalizeImportedConfig", () => {
  it("normalizes http with string headers (and coerces non-string values)", () => {
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

  it("normalizes sse with string headers", () => {
    // sse 分岐を明示的にカバーする（http と stdio のみだと sse コードパスは NoCoverage のまま残る）。
    // Covers the `type === "sse"` branch; without this the sse literal can survive mutations.
    const c = normalizeImportedConfig({
      type: "sse",
      url: "https://example.com/sse",
      headers: { "X-Flag": true },
    });
    expect(c).toEqual({
      type: "sse",
      url: "https://example.com/sse",
      headers: { "X-Flag": "true" },
    });
  });

  it("omits headers (undefined) when headers object is empty", () => {
    // `Object.keys(out).length > 0 ? out : undefined` の両分岐をカバー。
    // Pins the empty-object-to-undefined shortcut on the headers branch.
    const c = normalizeImportedConfig({
      type: "http",
      url: "https://example.com/mcp",
      headers: {},
    });
    expect(c.type).toBe("http");
    if (c.type === "http") {
      expect(c.headers).toBeUndefined();
    }
  });

  it("omits headers (undefined) when raw headers is not an object (e.g. string)", () => {
    // `!raw || typeof raw !== "object"` の early-return を検証する。
    // Covers the non-object headers early return.
    const c = normalizeImportedConfig({
      type: "http",
      url: "https://example.com/mcp",
      headers: "not-an-object",
    });
    expect(c.type).toBe("http");
    if (c.type === "http") {
      expect(c.headers).toBeUndefined();
    }
  });

  it("falls through to stdio when type=http but url is not a string", () => {
    // `typeof raw.url === "string"` の AND 条件を検証する。
    // Without this, `type === "http"` alone would take the http branch, leaking a bad config.
    const c = normalizeImportedConfig({
      type: "http",
      url: 123,
      command: "node",
      args: ["server.js"],
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.command).toBe("node");
      expect(c.args).toEqual(["server.js"]);
    }
  });

  it("falls through to stdio when type=sse but url is not a string", () => {
    // sse 側でも同じ AND 条件が効いていることを検証する。
    const c = normalizeImportedConfig({
      type: "sse",
      command: "sh",
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.command).toBe("sh");
    }
  });

  it("does not treat a non-http/non-sse type with a string url as sse (type discriminant matters)", () => {
    // `raw.type === "sse"` を `true` にする条件変異を殺すには、
    // "type が sse でないのに url が文字列" のケースで stdio になることを明示する。
    // Forces the sse branch to require the exact type string; a mutation that
    // short-circuits to `true` would incorrectly return an sse config here.
    const c = normalizeImportedConfig({
      type: "stdio",
      url: "https://not-sse.example.com",
      command: "node",
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.command).toBe("node");
    }
  });

  it("does not treat a non-http/non-sse type with a string url as http", () => {
    // 対称的に http 側の discriminant も検証する。
    // Symmetrically kill the http-side `raw.type === "http"` → `true` mutation.
    const c = normalizeImportedConfig({
      type: "unknown",
      url: "https://not-http.example.com",
      command: "node",
    });
    expect(c.type).toBe("stdio");
  });

  it("normalizes stdio with env object and coerces non-string values", () => {
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

  it("defaults stdio command to empty string when command is missing or non-string", () => {
    // 三項演算の else 側 `: ""` を検証する。
    // Pins the empty-string default; a mutation that drops it would yield `undefined`.
    const c = normalizeImportedConfig({
      args: ["a"],
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.command).toBe("");
      expect(c.args).toEqual(["a"]);
    }
  });

  it("leaves args undefined when raw.args is not an array", () => {
    // `Array.isArray(raw.args)` の else 側を検証する。
    // Covers the non-array args fallback so the `Array.isArray` gate can't be mutated away.
    const c = normalizeImportedConfig({
      command: "node",
      args: "not-an-array",
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.args).toBeUndefined();
    }
  });

  it("coerces non-string args entries to strings", () => {
    // `.map(String)` が効いていることを検証する（removal → 数値が残る）。
    // Kills a `.map(String)` → `(a) => a` mutation.
    const c = normalizeImportedConfig({
      command: "node",
      args: [1, true, "three"],
    });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.args).toEqual(["1", "true", "three"]);
    }
  });

  it("leaves env undefined when raw.env is missing", () => {
    const c = normalizeImportedConfig({ command: "node" });
    expect(c.type).toBe("stdio");
    if (c.type === "stdio") {
      expect(c.env).toBeUndefined();
    }
  });
});

describe("isValidMcpServerConfig", () => {
  it("rejects stdio with empty command (whitespace only)", () => {
    expect(isValidMcpServerConfig({ type: "stdio", command: "  ", args: [] })).toBe(false);
  });

  it("rejects stdio with an empty string command", () => {
    // `.trim().length > 0` → `>= 0` の境界変異を殺す（空文字列長さ 0 の扱い）。
    // Pins the `> 0` strict-greater comparison at the zero boundary.
    expect(isValidMcpServerConfig({ type: "stdio", command: "" })).toBe(false);
  });

  it("accepts stdio with command", () => {
    expect(isValidMcpServerConfig({ type: "stdio", command: "node" })).toBe(true);
  });

  it("accepts stdio with leading/trailing whitespace around a real command", () => {
    // `.trim()` が呼ばれていないと "  node  ".length > 0 で true を返すが、
    // `.trim()` → 削除は他のテストで検知される。ここでは真側の挙動を担保する。
    expect(isValidMcpServerConfig({ type: "stdio", command: "  node  " })).toBe(true);
  });

  it("rejects http with empty url", () => {
    expect(isValidMcpServerConfig({ type: "http", url: "   " })).toBe(false);
  });

  it("rejects sse with empty url", () => {
    // sse 型の分岐を明示的にカバーする。
    // `config.type === "stdio"` の else 側をカバーするための sse テスト。
    expect(isValidMcpServerConfig({ type: "sse", url: "" })).toBe(false);
  });

  it("accepts http with url", () => {
    expect(isValidMcpServerConfig({ type: "http", url: "https://x" })).toBe(true);
  });

  it("accepts sse with url", () => {
    expect(isValidMcpServerConfig({ type: "sse", url: "https://x" })).toBe(true);
  });
});
