/**
 * checkClaudeInstallation のユニットテスト
 *
 * - `claudeVersionArgv` のプラットフォーム別分岐
 * - `Bun.spawn` をモックして 0/非 0 終了・throw 系のシナリオを網羅
 *
 * Unit tests for the installation handler. We mock `Bun.spawn` rather than touching the host
 * file system so the test passes regardless of whether `claude` is on PATH.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkClaudeInstallation, claudeVersionArgv } from "./installation";

/** Bun.spawn のテスト用最小スタブ / Minimal stand-in for the bits of Bun.spawn we use. */
type SpawnStub = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
};

/** Build a single-chunk ReadableStream from a string. / 文字列から 1 チャンクのストリームを作る。 */
function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

/** Replace Bun.spawn for one test; return a vi.fn() spy. / 1 テストの間だけ Bun.spawn を差し替える。 */
function stubBunSpawn(impl: (argv: string[]) => SpawnStub | Promise<SpawnStub> | never): {
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(impl as (...args: unknown[]) => unknown);
  // biome / typescript: Bun.spawn の正確な型を入れずに最低限の差し替えを行う。
  // We intentionally don't import the full Bun typings; the handler only uses {stdout, stderr, exited}.
  vi.stubGlobal("Bun", {
    ...((globalThis as { Bun?: unknown }).Bun ?? {}),
    spawn: spy,
  });
  return { spy };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("claudeVersionArgv", () => {
  it("uses cmd.exe wrapper on win32 (npm shim resolution)", () => {
    expect(claudeVersionArgv("win32")).toEqual(["cmd.exe", "/c", "claude", "--version"]);
  });

  it("returns plain claude argv on darwin", () => {
    expect(claudeVersionArgv("darwin")).toEqual(["claude", "--version"]);
  });

  it("returns plain claude argv on linux", () => {
    expect(claudeVersionArgv("linux")).toEqual(["claude", "--version"]);
  });

  it("defaults to the host process.platform when not provided", () => {
    expect(claudeVersionArgv()).toEqual(claudeVersionArgv(process.platform));
  });
});

describe("checkClaudeInstallation", () => {
  it("returns installed=true with stdout version string on exit code 0", async () => {
    const { spy } = stubBunSpawn(() => ({
      stdout: streamOf("1.2.3 (Claude Code)\n"),
      stderr: streamOf(""),
      exited: Promise.resolve(0),
    }));

    const result = await checkClaudeInstallation();

    expect(result).toEqual({ installed: true, version: "1.2.3 (Claude Code)" });
    expect(spy).toHaveBeenCalledOnce();
    const argv = spy.mock.calls[0]?.[0] as string[];
    expect(argv).toEqual(claudeVersionArgv());
  });

  it("falls back to stderr when stdout is empty", async () => {
    // 一部の CLI はバージョンを stderr に書く。 Some CLIs print --version to stderr.
    stubBunSpawn(() => ({
      stdout: streamOf(""),
      stderr: streamOf("claude 9.9.9\n"),
      exited: Promise.resolve(0),
    }));

    const result = await checkClaudeInstallation();
    expect(result).toEqual({ installed: true, version: "claude 9.9.9" });
  });

  it("returns installed=true with no version when both streams are empty", async () => {
    stubBunSpawn(() => ({
      stdout: streamOf(""),
      stderr: streamOf(""),
      exited: Promise.resolve(0),
    }));

    const result = await checkClaudeInstallation();
    expect(result).toEqual({ installed: true, version: undefined });
  });

  it("returns installed=false when the CLI exits non-zero", async () => {
    stubBunSpawn(() => ({
      stdout: streamOf(""),
      stderr: streamOf("error: cannot find anthropic auth\n"),
      exited: Promise.resolve(1),
    }));

    const result = await checkClaudeInstallation();
    expect(result).toEqual({ installed: false });
  });

  it("returns installed=false when spawn throws (CLI not on PATH)", async () => {
    // PATH に claude が無いと Bun.spawn 自体が throw する。例外は飲み込み false を返す。
    // When `claude` is not on PATH Bun.spawn throws synchronously; we must catch and report `installed: false`.
    stubBunSpawn(() => {
      throw new Error("ENOENT: No such file or directory");
    });

    const result = await checkClaudeInstallation();
    expect(result).toEqual({ installed: false });
  });
});
