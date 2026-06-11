#!/usr/bin/env node
/**
 * Run Vitest with coverage for every workspace that participates in the
 * monorepo test matrix. Exits non-zero if any workspace fails.
 *
 * モノレポのテスト対象ワークスペースすべてで Vitest coverage を実行する。
 * いずれかが失敗したら非ゼロで終了する。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Array<{ name: string; cwd?: string; args: string[]; preInstall?: boolean }>} */
const workspaces = [
  { name: "src/ (frontend)", args: ["vitest", "run", "--coverage"] },
  {
    name: "admin",
    args: ["vitest", "run", "--coverage", "--config", "admin/vitest.config.ts"],
  },
  {
    name: "@zedi/shared",
    args: ["vitest", "run", "--coverage", "--config", "packages/shared/vitest.config.ts"],
  },
  {
    name: "@zedi/ui",
    args: ["vitest", "run", "--coverage", "--config", "packages/ui/vitest.config.ts"],
  },
  {
    name: "@zedi/claude-sidecar",
    args: ["vitest", "run", "--coverage", "--config", "packages/claude-sidecar/vitest.config.ts"],
  },
];

const serverWorkspaces = [
  {
    name: "server/hocuspocus",
    cwd: "server/hocuspocus",
    preInstall: true,
    args: ["vitest", "run", "--coverage", "--config", "vitest.config.ts"],
  },
  {
    name: "server/mcp",
    cwd: "server/mcp",
    preInstall: true,
    args: ["vitest", "run", "--coverage", "--config", "vitest.config.ts"],
  },
  {
    name: "server/api",
    cwd: "server/api",
    preInstall: true,
    args: ["vitest", "run", "--coverage"],
  },
];

const includeServers = process.argv.includes("--with-servers");
const targets = includeServers ? [...workspaces, ...serverWorkspaces] : workspaces;

const spawnShell = process.platform === "win32";

/**
 * @param {import("node:child_process").SpawnSyncReturns<Buffer | string>} result
 */
function exitOnSpawnFailure(result) {
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * @param {string} label
 * @param {string[]} command
 * @param {string} cwd
 */
function run(label, command, cwd) {
  console.log(`\n=== Coverage: ${label} ===\n`);
  const result = spawnSync("bunx", command, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: spawnShell,
  });
  exitOnSpawnFailure(result);
}

for (const workspace of targets) {
  const cwd = path.join(repoRoot, workspace.cwd ?? ".");
  if (workspace.preInstall) {
    console.log(`\n--- Installing dependencies for ${workspace.name} ---\n`);
    const install = spawnSync("bun", ["install", "--frozen-lockfile"], {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: spawnShell,
    });
    exitOnSpawnFailure(install);
  }
  run(workspace.name, workspace.args, cwd);
}
