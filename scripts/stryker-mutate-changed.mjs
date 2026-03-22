#!/usr/bin/env node
/**
 * Run Stryker only on git-changed files under `src/` (production code, not tests).
 * 変更された src 配下のソースだけをミューテーション対象にする。
 *
 * Usage:
 *   node scripts/stryker-mutate-changed.mjs
 *   node scripts/stryker-mutate-changed.mjs --ignoreStatic
 *   node scripts/stryker-mutate-changed.mjs --dryRunOnly
 *
 * Environment:
 *   STRYKER_DIFF_BASE=develop  — compare against base branch (git diff base...HEAD) instead of working tree vs HEAD
 *
 * Config: `stryker.config.mutation-changed.mjs` (extends `stryker.config.mjs`; `thresholds.break` disabled for partial `--mutate` runs).
 */

import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string | undefined} base
 * @returns {string[]}
 */
function getChangedPaths(base) {
  if (base) {
    const result = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      encoding: "utf8",
      cwd: root,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        (result.stderr && String(result.stderr)) ||
          `git diff failed with status ${result.status ?? "unknown"}`,
      );
    }
    const out = result.stdout ?? "";
    return out.trim().split("\n").filter(Boolean);
  }
  const vsHead = execSync("git diff --name-only HEAD", {
    encoding: "utf8",
    cwd: root,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const untracked = execSync("git ls-files --others --exclude-standard", {
    encoding: "utf8",
    cwd: root,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  return [...new Set([...vsHead, ...untracked])];
}

/**
 * @param {string} f
 * @returns {boolean}
 */
function isMutableSourceFile(f) {
  if (!f.startsWith("src/")) return false;
  if (!/\.(ts|tsx)$/.test(f)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(f)) return false;
  if (f.includes("/__tests__/")) return false;
  return true;
}

const base = process.env.STRYKER_DIFF_BASE?.trim() || "";
const paths = getChangedPaths(base || undefined).filter(isMutableSourceFile);

if (paths.length === 0) {
  console.error(
    "stryker-mutate-changed: No changed files under src/ (excluding *.test.* / __tests__).",
  );
  console.error(
    "  Tip: commit or stage changes, or set STRYKER_DIFF_BASE=develop to diff against a branch.",
  );
  process.exit(1);
}

const mutateArg = paths.join(",");
const userArgs = process.argv.slice(2);

console.error(`stryker-mutate-changed: ${paths.length} file(s) → Stryker --mutate`);
paths.forEach((p) => console.error(`  - ${p}`));

const strykerArgs = [
  "run",
  "--mutate",
  mutateArg,
  ...userArgs,
  "stryker.config.mutation-changed.mjs",
];

const strykerCli = join(root, "node_modules", "@stryker-mutator", "core", "bin", "stryker.js");

const result = spawnSync(process.execPath, [strykerCli, ...strykerArgs], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

process.exit(result.status ?? 1);
