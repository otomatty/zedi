/**
 * Detects whether the `claude` CLI is on PATH and returns `--version` output when possible.
 * `claude` CLI が PATH にあり `--version` を取得できるか検査する。
 */

/** Outcome of a Claude CLI presence check. / Claude CLI 存在確認の結果 */
export interface InstallationCheckResult {
  installed: boolean;
  version?: string;
}

const CLAUDE = process.platform === "win32" ? "claude.exe" : "claude";

/**
 * Runs `claude --version` (or `claude.exe` on Windows).
 * `claude --version` を実行する（Windows は `claude.exe`）。
 */
export async function checkClaudeInstallation(): Promise<InstallationCheckResult> {
  try {
    const proc = Bun.spawn([CLAUDE, "--version"], {
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
