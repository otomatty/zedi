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
});
