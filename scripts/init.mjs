#!/usr/bin/env node
/**
 * First-time / frontend-focused repo initialization.
 * フロント開発向けの初回セットアップ（依存・hooks・.env・検証・エージェントミラー）。
 *
 * Usage: bun run init
 * Skip lint/build on re-runs: SKIP_BUILD=1 bun run init  (or --skip-build)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkAgentMirrors } from "./setup-agent-mirrors.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipBuild = process.env.SKIP_BUILD === "1" || process.argv.includes("--skip-build");

/**
 * @param {string} label
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ optional?: boolean }} [opts]
 */
function run(label, cmd, args, opts = {}) {
  console.log(`\n[INFO] ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    if (opts.optional) {
      console.warn(`[WARN] ${label} — finished with warnings (non-blocking)`);
      return;
    }
    process.exit(result.status ?? 1);
  }
}

/**
 * @param {string} cmd
 * @returns {boolean}
 */
function hasCommand(cmd) {
  const which = process.platform === "win32" ? "where" : "command";
  const whichArg = process.platform === "win32" ? [cmd] : ["-v", cmd];
  const result = spawnSync(which, whichArg, {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

console.log("");
console.log("===============================");
console.log("  Zedi Init (frontend)");
console.log("===============================");

if (!hasCommand("bun")) {
  console.error("[ERROR] Bun is not installed. Install from https://bun.sh/");
  process.exit(1);
}

run("Bun version", "bun", ["--version"]);

if (hasCommand("node")) {
  run("Node.js version", "node", ["--version"]);
} else {
  console.warn("[WARN] Node.js is not installed. Some tools may not work without it.");
}

if (!hasCommand("git")) {
  console.error("[ERROR] Git is not installed.");
  process.exit(1);
}
run("Git version", "git", ["--version"]);

run("Installing dependencies (root workspace)", "bun", ["install"]);
run("Setting up Git hooks (husky)", "bunx", ["husky"]);

const envLocal = path.join(repoRoot, ".env.local");
const envDevelopment = path.join(repoRoot, ".env.development");
const envExample = path.join(repoRoot, ".env.example");

if (!fs.existsSync(envLocal) && !fs.existsSync(envDevelopment)) {
  if (!fs.existsSync(envExample)) {
    console.error("[ERROR] .env.example is missing. Cannot create .env.local.");
    process.exit(1);
  }
  console.log("\n[INFO] Creating .env.local from .env.example...");
  fs.copyFileSync(envExample, envLocal);
  console.warn("[WARN] Update .env.local if you need API/auth/AI keys.");
  console.warn("[WARN] Frontend works without external services (local IndexedDB mode).");
} else {
  console.log("\n[INFO] .env file already exists, skipping.");
}

if (skipBuild) {
  console.log("\n[INFO] Skipping lint/build (SKIP_BUILD=1 or --skip-build).");
} else {
  console.log("\n[INFO] Verifying setup...");
  run("Lint", "bun", ["run", "lint", "--quiet"], { optional: true });
  run("Build", "bun", ["run", "build"]);
}

console.log("\n[INFO] Linking agent mirrors (.agents → .claude / .cursor)");
try {
  linkAgentMirrors(repoRoot);
} catch (err) {
  const message = err instanceof Error ? err.message : "Failed to link agent mirrors.";
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

console.log("");
console.log("===============================");
console.log("  Setup complete!");
console.log("===============================");
console.log("");
console.log("  Quick start:");
console.log("    bun run dev          http://localhost:30000");
console.log("    bun run test         unit tests");
console.log("    bun run lint         linter");
console.log("");
console.log("  Agent skills canonical path: .agents/");
console.log("  See CONTRIBUTING.md for workflow.");
console.log("");
