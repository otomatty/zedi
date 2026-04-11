/**
 * config.ts のテスト
 *
 * - プラットフォームごとのパス解決
 * - JSON 読み込み, 不在/不正の処理
 *
 * Tests for config path resolution and JSON loader.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMcpClientConfig, resolveMcpClientConfigPath } from "../config.js";

describe("resolveMcpClientConfigPath", () => {
  it("returns APPDATA path on win32 when APPDATA is set", () => {
    if (process.platform !== "win32") return;
    const path = resolveMcpClientConfigPath({ APPDATA: "C:/AppData" });
    expect(path).toContain("AppData");
    expect(path.endsWith("zedi\\mcp.json") || path.endsWith("zedi/mcp.json")).toBe(true);
  });

  it("uses XDG_CONFIG_HOME on non-win32 when set", () => {
    if (process.platform === "win32") return;
    const path = resolveMcpClientConfigPath({ XDG_CONFIG_HOME: "/tmp/cfg" });
    expect(path).toBe("/tmp/cfg/zedi/mcp.json");
  });

  it("falls back to ~/.config on non-win32 when XDG is unset", () => {
    if (process.platform === "win32") return;
    const path = resolveMcpClientConfigPath({});
    expect(path).toContain(".config/zedi/mcp.json");
  });
});

describe("loadMcpClientConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "zedi-mcp-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when file does not exist", () => {
    expect(loadMcpClientConfig(join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns null when file has invalid JSON", () => {
    const file = join(tmpDir, "bad.json");
    writeFileSync(file, "{not-json", "utf-8");
    expect(loadMcpClientConfig(file)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const file = join(tmpDir, "partial.json");
    writeFileSync(file, JSON.stringify({ apiUrl: "https://x" }), "utf-8");
    expect(loadMcpClientConfig(file)).toBeNull();
  });

  it("returns parsed config on success", () => {
    const dir = join(tmpDir, "zedi");
    mkdirSync(dir);
    const file = join(dir, "mcp.json");
    writeFileSync(
      file,
      JSON.stringify({ apiUrl: "https://api.example.com", token: "tkn" }),
      "utf-8",
    );
    const result = loadMcpClientConfig(file);
    expect(result).toEqual({ apiUrl: "https://api.example.com", token: "tkn" });
  });

  it("returns null when apiUrl is present but token is a number (not string)", () => {
    const file = join(tmpDir, "bad-token.json");
    writeFileSync(file, JSON.stringify({ apiUrl: "https://x", token: 12345 }), "utf-8");
    expect(loadMcpClientConfig(file)).toBeNull();
  });

  it("returns null when apiUrl is missing and only token is present", () => {
    const file = join(tmpDir, "no-api-url.json");
    writeFileSync(file, JSON.stringify({ token: "tkn" }), "utf-8");
    expect(loadMcpClientConfig(file)).toBeNull();
  });

  it("returns null when config is an empty object", () => {
    const file = join(tmpDir, "empty.json");
    writeFileSync(file, JSON.stringify({}), "utf-8");
    expect(loadMcpClientConfig(file)).toBeNull();
  });

  it("ignores extra fields and returns only apiUrl and token", () => {
    const file = join(tmpDir, "extra-fields.json");
    writeFileSync(
      file,
      JSON.stringify({ apiUrl: "https://api.example.com", token: "tkn", extra: "ignored" }),
      "utf-8",
    );
    const result = loadMcpClientConfig(file);
    expect(result).toEqual({ apiUrl: "https://api.example.com", token: "tkn" });
    // Verify extra fields are not exposed on the returned object
    expect((result as Record<string, unknown>)?.extra).toBeUndefined();
  });
});

describe("resolveMcpClientConfigPath – additional edge cases", () => {
  it("falls back to homedir/.config on non-win32 when neither XDG_CONFIG_HOME is set", () => {
    if (process.platform === "win32") return;
    const path = resolveMcpClientConfigPath({});
    // Should include .config/zedi/mcp.json relative to homedir
    expect(path).toMatch(/\.config[/\\]zedi[/\\]mcp\.json$/);
  });
});