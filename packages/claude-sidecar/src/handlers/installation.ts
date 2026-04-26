/**
 * Detects whether the `claude` CLI is on PATH and returns `--version` output when possible.
 * `claude` CLI が PATH にあり `--version` を取得できるか検査する。
 */

/** Outcome of a Claude CLI presence check. / Claude CLI 存在確認の結果 */
export interface InstallationCheckResult {
  installed: boolean;
  version?: string;
}

/**
 * argv for `claude --version` (Windows uses `cmd /c` for npm-style shims).
 * Windows は npm 系シム解決のため cmd 経由。
 *
 * @param platform - Override of `process.platform` for testing. / テスト用に `process.platform` を差し替えるためのオプション。
 * @internal exported for unit testing only.
 */
export function claudeVersionArgv(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    return ["cmd.exe", "/c", "claude", "--version"];
  }
  return ["claude", "--version"];
}

/**
 * Runs `claude --version` (or `claude.exe` on Windows).
 * `claude --version` を実行する（Windows は `claude.exe`）。
 */
export async function checkClaudeInstallation(): Promise<InstallationCheckResult> {
  try {
    const proc = Bun.spawn(claudeVersionArgv(), {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const stdoutText = await new Response(proc.stdout).text();
    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      const version = stdoutText.trim() || stderrText.trim() || undefined;
      return { installed: true, version };
    }
  } catch {
    /* not on PATH or spawn failed */
  }
  return { installed: false };
}
